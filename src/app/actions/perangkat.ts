"use server";

import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { aiErrorMessage, generateText, isPerangkatAiAvailable, PROVIDER_CHOICES, providerUnavailableMessage, refundAllowance, remainingAllowance, takeAllowance, type ProviderChoice } from "@/lib/ai";
import { AiError } from "@/lib/ai-error";
import { toQuestionInput, type AiQuestionItem } from "@/lib/ai-questions";
import { requireTeacher } from "@/lib/session";
import { extractText } from "@/lib/perangkat/extract-text";
import {
  buatCpTpAtp,
  buatMateriGuru,
  buatMateriSiswa,
  buatModulAjar,
  cariBabUntukTp,
  cariSemesterUntukTp,
  imporCpTpAtp,
  judulPerangkat,
  konteksDariCp,
  materiKeMarkdown,
  pertemuanUntukJurnal,
  semesterGanjilGenap,
  type DocKind,
  type PerangkatKonteks,
  type PertemuanJurnal,
  type RunPrompt,
} from "@/lib/perangkat/generator";
import { BATAS_IMPOR, SISTEM } from "@/lib/perangkat/prompts";
import { docContext, getOwnedDoc, getSetting, getTemplate, listCpDocs, saveSetting, type PerangkatSetting } from "@/lib/perangkat/store";
import { isObj, obj, objs, str, type Obj } from "@/lib/perangkat/util";
import { saveQuestionMany } from "./question";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/teacher/perangkat-ajar");

/* ------------------------------------------------------------------ input */
const field = (max: number) => z.string().trim().max(max, "Too long").default("");

/** Fields of the form: the context of a generation plus the identity used on the signature block. */
const contextFields = {
  mata_pelajaran: field(120),
  kelas: field(40),
  fase: field(20),
  semester: field(40),
  tahun_ajaran: field(20),
  alokasi_waktu: field(80),
  nama_sekolah: field(160),
  nama_guru: field(120),
  nama_kepala: field(120),
  nip_guru: field(40),
  nip_kepala: field(40),
  kota: field(80),
  template_id: field(40),
  topik: field(300),
  tujuan_pembelajaran: field(600),
  catatan: field(1000),
  jumlah_tp: field(10),
};

const providerField = z.enum(PROVIDER_CHOICES).default("auto");
const requestSchema = z.object({ kind: z.literal("modul_ajar"), provider: providerField, ...contextFields });
const importSchema = z.object({ provider: providerField, ...contextFields, source_text: z.string().max(200_000).default("") });

type GenerationInput = Omit<z.infer<typeof requestSchema>, "provider">;

/** Context values kept with a document, without empty ones. */
function toContext(v: Omit<GenerationInput, "kind">): PerangkatKonteks {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === "string" && val.trim()) out[k] = val.trim();
  return out as PerangkatKonteks;
}

const settingFrom = (v: Omit<GenerationInput, "kind">): PerangkatSetting => ({
  mata_pelajaran: v.mata_pelajaran,
  kelas: v.kelas,
  fase: v.fase,
  semester: v.semester,
  tahun_ajaran: v.tahun_ajaran,
  alokasi_waktu: v.alokasi_waktu,
  nama_sekolah: v.nama_sekolah,
  nama_guru: v.nama_guru,
  nama_kepala: v.nama_kepala,
  nip_guru: v.nip_guru,
  nip_kepala: v.nip_kepala,
  kota: v.kota,
  template_id: v.template_id || "bawaan",
});

/* ------------------------------------------------------------------ job runner */
type Work = (run: RunPrompt) => Promise<Obj>;

/** Runs after the response is sent: the AI can take minutes, so the page polls the row for the result. */
async function runJob(docId: string, teacherId: string, kind: DocKind, context: PerangkatKonteks, work: Work, choice: ProviderChoice) {
  let provider: string | null = null;
  const run: RunPrompt = async (prompt) => {
    const r = await generateText({ system: SISTEM, prompt, provider: choice });
    provider = r.provider;
    return r.text;
  };
  try {
    let data: Obj;
    try {
      data = await work(run);
    } catch (e) {
      // Claude Code cannot enforce a JSON schema; if one reply was not valid JSON, one more try is cheaper than a failed document.
      if (!(e instanceof AiError) || !/format could not be read/i.test(e.message)) throw e;
      console.error("[perangkat] reply was not valid JSON, retrying once", kind);
      data = await work(run);
    }
    // For CP-TP-ATP, the document's own identity — as the AI actually read it from the source — is the
    // ground truth. Reconcile the saved context with it so the class tag and title never lag behind a
    // stale "Konteks" form value.
    let finalContext = context;
    if (kind === "cp_tp_atp") {
      const extracted = konteksDariCp(data);
      finalContext = { ...context, ...Object.fromEntries(Object.entries(extracted).filter(([, val]) => val)) };
      // An uploaded file's own class is the only trustworthy signal for it. If the source document didn't
      // state one the AI could read, don't silently keep whatever was left in the "Konteks" form from
      // earlier, unrelated work — leave it unset so the teacher notices and fills it in themselves.
      if (context.impor && !extracted.kelas) delete finalContext.kelas;
    }

    await db
      .update(S.teachingDoc)
      .set({ data, title: judulPerangkat(kind, data, finalContext), context: finalContext, status: "done", error: null, provider })
      .where(and(eq(S.teachingDoc.id, docId), eq(S.teachingDoc.status, "pending")));
  } catch (e) {
    console.error("[perangkat] generation failed", kind, e);
    const message = aiErrorMessage(e);
    // Only refund if this run is the one that turned the row into an error (the stale sweeper may have done it already).
    const flipped = await db
      .update(S.teachingDoc)
      .set({ status: "error", error: message, provider })
      .where(and(eq(S.teachingDoc.id, docId), eq(S.teachingDoc.status, "pending")))
      .returning({ id: S.teachingDoc.id });
    if (flipped.length) await refundAllowance(teacherId).catch(() => undefined);
  }
}

async function launch(args: { teacherId: string; kind: DocKind; context: PerangkatKonteks; sourceId?: string; work: Work; provider: ProviderChoice }): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  if (!(await isPerangkatAiAvailable(args.provider))) return fail(t(providerUnavailableMessage(args.provider)));
  if (!(await takeAllowance(args.teacherId))) return fail(t("You have reached today's AI usage limit. Try again tomorrow."));
  const [row] = await db
    .insert(S.teachingDoc)
    .values({ teacherId: args.teacherId, kind: args.kind, title: judulPerangkat(args.kind, null, args.context), context: args.context, sourceId: args.sourceId ?? null, status: "pending" })
    .returning({ id: S.teachingDoc.id });
  after(() => runJob(row.id, args.teacherId, args.kind, args.context, args.work, args.provider));
  refresh();
  return succeed(undefined, { id: row.id });
}

/** Text of the uploaded `file`, or else the pasted text; an error message when neither gives enough text. */
async function sourceFrom(formData: FormData, pasted: string, missing: string): Promise<{ text: string } | { error: string }> {
  const t = await getT();
  let text = pasted.trim();
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    try {
      text = await extractText(file);
    } catch (e) {
      return { error: t(aiErrorMessage(e)) };
    }
  }
  if (text.length < 50) return { error: t(missing) };
  return { text };
}

/* ------------------------------------------------------------------ CP-TP-ATP from the official CP */
/**
 * The AI drafts TP and ATP, but the CP itself must come from the official government document the teacher
 * uploads, so it is never made up.
 */
export async function startCpFromOfficial(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const raw: Record<string, string> = {};
  for (const [k, val] of formData.entries()) if (typeof val === "string") raw[k] = val;
  const p = importSchema.safeParse(raw);
  if (!p.success) return zodError(p.error, formData);
  const { source_text, provider, ...v } = p.data;

  if (!v.mata_pelajaran) return fail(t("Enter the subject."));
  if (!v.kelas) return fail(t("Enter the class."));
  const src = await sourceFrom(formData, source_text, "Upload the official CP document or paste its text first.");
  if ("error" in src) return fail(src.error);
  if (src.text.length > BATAS_IMPOR) return fail(t("The official CP document is too long. Upload only the CP of your subject (for example, only the Seni Musik part)."));

  await saveSetting(teacher.id, settingFrom(v));
  const context = toContext(v);
  const cpResmi = src.text;
  return launch({ teacherId: teacher.id, kind: "cp_tp_atp", context, provider, work: (run) => buatCpTpAtp(run, context, cpResmi) });
}

/* ------------------------------------------------------------------ Modul Ajar */
export async function startGeneration(data: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = requestSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const { kind, provider, ...v } = p.data;

  // Identity is optional for a Modul Ajar.
  if (!v.topik && !v.tujuan_pembelajaran) return fail(t("Enter the topic or choose a learning objective (TP)."));

  await saveSetting(teacher.id, settingFrom(v));
  const context = toContext(v);

  // Modul Ajar: the BAB number/title come from the UNIT of the saved CP-TP-ATP that holds the chosen TP.
  const template = await getTemplate(teacher.id, v.template_id);
  context.template_id = template.id;
  context.template_nama = template.nama;
  if (v.tujuan_pembelajaran) {
    const cps = await listCpDocs(teacher.id);
    const bab = cariBabUntukTp(cps, v.tujuan_pembelajaran);
    if (bab) {
      context.bab_nomor = bab.nomor;
      context.bab_judul = bab.judul;
    }
    if (!v.semester) context.semester = cariSemesterUntukTp(cps, v.tujuan_pembelajaran);
  }
  return launch({ teacherId: teacher.id, kind, context, provider, work: (run) => buatModulAjar(run, context, template) });
}

const suggestTopikSchema = z.object({
  tujuan_pembelajaran: z.string().trim().min(1, "Choose a TP first").max(600),
  mata_pelajaran: z.string().trim().max(120).optional(),
  provider: providerField,
});

/** A short lesson-topic title suggested by the AI, summarizing the chosen TP — a quick foreground call, not a tracked job. */
export async function suggestTopik(data: unknown): Promise<ActionResult<{ topik: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = suggestTopikSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const { tujuan_pembelajaran, mata_pelajaran, provider } = p.data;

  if (!(await isPerangkatAiAvailable(provider))) return fail(t(providerUnavailableMessage(provider)));
  if (!(await takeAllowance(teacher.id))) return fail(t("You have reached today's AI usage limit. Try again tomorrow."));

  try {
    const { text } = await generateText({
      system:
        "Anda membantu guru merangkum satu Tujuan Pembelajaran (TP) menjadi judul topik pelajaran yang singkat, jelas, dan menarik untuk siswa. Balas HANYA judul topiknya dalam Bahasa Indonesia — tanpa tanda kutip, tanpa penjelasan, tanpa nomor TP, maksimal 8 kata.",
      prompt: `Mata pelajaran: ${mata_pelajaran || "-"}\nTujuan Pembelajaran: ${tujuan_pembelajaran}\n\nBuat SATU judul topik singkat yang mewakili isi TP ini.`,
      provider,
      maxTokens: 60,
    });
    const topik = text
      .trim()
      .split("\n")[0]
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .slice(0, 300);
    if (!topik) throw new AiError("The AI did not return a topic title.");
    return succeed(undefined, { topik });
  } catch (e) {
    await refundAllowance(teacher.id);
    return fail(t(aiErrorMessage(e)));
  }
}

/** Tidy the teacher's own CP-TP-ATP (file or pasted text) into the structured form, without inventing content. */
export async function startImportCp(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const raw: Record<string, string> = {};
  for (const [k, val] of formData.entries()) if (typeof val === "string") raw[k] = val;
  const p = importSchema.safeParse(raw);
  if (!p.success) return zodError(p.error, formData);
  const { source_text, provider, ...v } = p.data;

  const src = await sourceFrom(formData, source_text, "Upload a file or paste the text of your CP-TP-ATP first.");
  if ("error" in src) return fail(src.error);
  const source = src.text;

  await saveSetting(teacher.id, settingFrom(v));
  const context = { ...toContext(v), impor: true };
  return launch({ teacherId: teacher.id, kind: "cp_tp_atp", context, provider, work: (run) => imporCpTpAtp(run, context, source) });
}

/* ------------------------------------------------------------------ Materi Guru / Siswa (derived) */
const derivedSchema = z.object({ sourceId: z.uuid("Invalid document"), kind: z.enum(["materi_guru", "materi_siswa"]), provider: providerField });

export async function startDerived(data: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = derivedSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const { sourceId, kind, provider } = p.data;

  const source = await getOwnedDoc(teacher.id, sourceId);
  if (!source) return fail(t("Document not found."));
  const need: DocKind = kind === "materi_guru" ? "modul_ajar" : "materi_guru";
  if (source.kind !== need) return fail(t(kind === "materi_guru" ? "Teacher material can only be made from a Modul Ajar." : "Student material can only be made from the teacher material."));
  if (source.status !== "done" || !isObj(source.data)) return fail(t("The source document is not finished yet."));

  // Same context as the source, without the BAB line (that is only for the Modul Ajar prompt).
  const context: PerangkatKonteks = { ...docContext(source) };
  delete context.bab_nomor;
  delete context.jumlah_tp;
  const sourceData = source.data;
  return launch({
    teacherId: teacher.id,
    kind,
    context,
    sourceId,
    provider,
    work: kind === "materi_guru" ? (run) => buatMateriGuru(run, sourceData, context) : (run) => buatMateriSiswa(run, sourceData, context),
  });
}

/* ------------------------------------------------------------------ Lessons library */
/**
 * Copy a finished teacher/student material into the Lessons library (the `material` table used by
 * /teacher/materials), so it can be assigned to classes like any other lesson. Keeps the same Markdown shape
 * as the AI Generator's "Create Lessons & Summaries" (see materiKeMarkdown) so lessons look consistent.
 */
export async function saveMaterialFromDoc(docId: string): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const doc = await getOwnedDoc(teacher.id, docId);
  if (!doc || doc.status !== "done") return fail(t("Document not found."));
  if (doc.kind !== "materi_guru" && doc.kind !== "materi_siswa") return fail(t("Only teacher or student material can be added to Lessons."));

  const content = materiKeMarkdown(doc.kind, obj(doc.data)).slice(0, 50_000);
  if (content.trim().length < 3) return fail(t("This document has no content to add."));

  const ctx = docContext(doc);
  const topic = (str(ctx.bab_judul) || str(ctx.topik) || "").slice(0, 300) || null;

  const [m] = await db
    .insert(S.material)
    .values({ teacherId: teacher.id, title: doc.title.slice(0, 150), topic, content, typeMedia: "text", kelas: ctx.kelas || null })
    .returning({ id: S.material.id });
  revalidatePath("/teacher/materials");
  return succeed(t("Added to Lessons."), { id: m.id });
}

/* ------------------------------------------------------------------ used from the teaching journal */

/** A Modul Ajar's meetings, reshaped for the journal's "Fill from Modul Ajar" picker. */
export async function getModulAjarUntukJurnal(id: string): Promise<ActionResult<{ pertemuan: PertemuanJurnal[] }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const doc = await getOwnedDoc(teacher.id, id);
  if (!doc || doc.kind !== "modul_ajar" || doc.status !== "done" || !isObj(doc.data)) return fail(t("Document not found."));
  const pertemuan = pertemuanUntukJurnal(doc.data);
  if (!pertemuan.length) return fail(t("This Modul Ajar has no meetings yet."));
  return succeed(undefined, { pertemuan });
}

/* ------------------------------------------------------------------ library */
export async function deleteDoc(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const doc = await getOwnedDoc(teacher.id, id);
  if (!doc) return fail(t("Document not found."));
  await db.delete(S.teachingDoc).where(eq(S.teachingDoc.id, doc.id));
  refresh();
  return succeed(t("Document deleted."));
}

const setKelasSchema = z.object({ id: z.uuid(), kelas: z.string().trim().max(40, "Too long") });

/** Set or correct the class (grade level) tag on an existing document — for one that never got it, such as an uploaded CP-TP-ATP. */
export async function setDocKelas(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = setKelasSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const doc = await getOwnedDoc(teacher.id, p.data.id);
  if (!doc) return fail(t("Document not found."));

  const context: PerangkatKonteks = { ...docContext(doc) };
  if (p.data.kelas) context.kelas = p.data.kelas;
  else delete context.kelas;

  await db.update(S.teachingDoc).set({ context }).where(eq(S.teachingDoc.id, doc.id));
  refresh();
  revalidatePath("/teacher/materials");
  return succeed(t("Class saved."));
}

export async function aiRemaining(): Promise<{ remaining: number; limit: number }> {
  const teacher = await requireTeacher();
  return remainingAllowance(teacher.id);
}

/* ------------------------------------------------------------------ multiple choice -> question bank */
/** Letter of the answer key ("b", "B.", "b)") -> option index, or -1. */
const letterIndex = (kunci: string) => {
  const m = /[a-d]/i.exec(kunci);
  return m ? m[0].toLowerCase().charCodeAt(0) - 97 : -1;
};

/** Options come as "a. text"; the bank stores the text only. */
const stripLetter = (o: string) => o.replace(/^\s*[a-eA-E][.)]\s*/, "").trim();

/**
 * Copy the multiple-choice questions of a document (the test in a Modul Ajar, or the LKPD in the teacher material)
 * to the question bank. Essay questions are skipped: the LMS has no essay type.
 */
export async function importQuestionsToBank(docId: string): Promise<ActionResult<{ count: number; skipped: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const doc = await getOwnedDoc(teacher.id, docId);
  if (!doc || doc.status !== "done") return fail(t("Document not found."));
  if (doc.kind !== "modul_ajar" && doc.kind !== "materi_guru") return fail(t("This document has no answer key to import."));

  const d = obj(doc.data);
  const source = doc.kind === "modul_ajar" ? obj(d.tes) : obj(d.lkpd);
  const pg = objs(source.pilihan_ganda);
  const topic = str(d.materi_bab || d.judul_bab || d.judul || doc.title).slice(0, 80);
  const ctx = docContext(doc);

  const items: NonNullable<ReturnType<typeof toQuestionInput>>[] = [];
  for (const q of pg) {
    const options = (Array.isArray(q.opsi) ? q.opsi : []).map((o) => stripLetter(String(o))).filter(Boolean);
    const item: AiQuestionItem = {
      type: "multiple_choice",
      prompt: str(q.soal),
      options,
      indexCorrect: letterIndex(str(q.kunci)),
      trueFalse: true,
      fillInAnswers: [],
      noteMidi: [],
      modeMidi: "ordered",
      explanation: str(q.pembahasan),
    };
    const valid = item.indexCorrect >= 0 && item.indexCorrect < options.length ? toQuestionInput(item, topic) : null;
    if (valid) items.push({ ...valid, kelas: ctx.kelas?.trim() || null, semester: semesterGanjilGenap(ctx.semester) });
  }
  if (!items.length) return fail(t("This document has no multiple-choice questions that can be imported."));

  const r = await saveQuestionMany(items);
  if (!r.ok) return fail(r.error ?? t("Could not save the questions."));
  const essays = Array.isArray(source.uraian) ? source.uraian.length : 0;
  return succeed(t("{0} questions saved to the question bank.", items.length), { count: items.length, skipped: pg.length - items.length + essays });
}

