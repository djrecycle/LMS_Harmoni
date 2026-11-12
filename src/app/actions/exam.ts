"use server";

import { after } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { deleteMediaIfOrphaned, getOwnedQuestion, isUuid, isValidMediaKey, getOwnedQuiz } from "@/lib/access";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { aiErrorMessage, canUseAi, generateText, PROVIDER_CHOICES, providerUnavailableMessage, refundAllowance, takeAllowance, type ProviderChoice } from "@/lib/ai";
import { AiError } from "@/lib/ai-error";
import { COGNITIVE_LEVELS, EXAM_SECTIONS, SECTION_META, pointsPerQuestion, readComposition, sectionForType, totalCount, type ExamSection } from "@/lib/exam";
import { EXAM_SYSTEM, gambarPrompt, kisiPrompt, parseKisi, parseSoal, readGambar, soalPrompt, toExamQuestion, type SoalTarget } from "@/lib/exam-ai";
import { getOwnedExam, listExamItems, nextPosition } from "@/lib/exam-store";
import { semesterGanjilGenap } from "@/lib/perangkat/generator";
import { normalize, toDbValues } from "@/lib/question-db";
import { requireTeacher } from "@/lib/session";
import { fromWibInput } from "@/lib/utils";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/teacher/exams", "layout");

/* ------------------------------------------------------------------ exam (identity, TP, composition) */

const text = (max: number) => z.string().trim().max(max, "Too long").default("");
const plan = z.object({ count: z.number().int().min(0).max(100), weight: z.number().min(0).max(100) });

const examSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
  info: z
    .object({
      jenis_ujian: text(80),
      mata_pelajaran: text(120),
      kelas: text(40),
      fase: text(20),
      semester: text(40),
      tahun_ajaran: text(20),
      nama_sekolah: text(160),
      nama_guru: text(120),
      alokasi_waktu: text(60),
    })
    .default({ jenis_ujian: "", mata_pelajaran: "", kelas: "", fase: "", semester: "", tahun_ajaran: "", nama_sekolah: "", nama_guru: "", alokasi_waktu: "" }),
  tps: z.array(z.string().trim().min(1).max(600)).max(60).default([]),
  composition: z.object({ pg: plan, pgk: plan, jodoh: plan, isian: plan, uraian: plan, pgOptions: z.union([z.literal(4), z.literal(5)]) }),
});

/** Create (no id) or update an exam's identity, chosen TP and composition. */
export async function saveExam(data: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = examSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const v = p.data;
  if (totalCount(v.composition) === 0) return fail(t("Plan at least one question."));
  const info = Object.fromEntries(Object.entries(v.info).filter(([, x]) => x)) as typeof v.info;
  const values = { title: v.title, info, tps: [...new Set(v.tps)], composition: v.composition, updatedAt: new Date() };

  if (id) {
    const e = await getOwnedExam(teacher.id, id);
    if (!e) return fail(t("Exam not found."));
    await db.update(S.exam).set(values).where(eq(S.exam.id, e.id));
    refresh();
    return succeed(t("Exam saved."), { id: e.id });
  }
  const [fresh] = await db.insert(S.exam).values({ teacherId: teacher.id, ...values }).returning({ id: S.exam.id });
  refresh();
  return succeed(t("Exam created."), { id: fresh.id });
}

export async function deleteExam(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const e = await getOwnedExam(teacher.id, id);
  if (!e) return fail(t("Exam not found."));
  await db.delete(S.exam).where(eq(S.exam.id, e.id));
  refresh();
  return succeed(t("Exam deleted. Its questions stay in the question bank."));
}

/* ------------------------------------------------------------------ AI jobs */

const jobSchema = z.object({
  provider: z.enum(PROVIDER_CHOICES).default("auto"),
  catatan: z.string().trim().max(1500).default(""),
  /** Let the AI add notation images to questions that suit them. */
  gambar: z.boolean().default(true),
});

/** Start an AI job on the exam (only one at a time). Returns an error message, or null when it started. */
async function claimJob(examId: string, teacherId: string, job: "kisi" | "soal" | "gambar", provider: ProviderChoice): Promise<string | null> {
  const t = await getT();
  if (!(await canUseAi(teacherId, provider))) return t(providerUnavailableMessage(provider));
  const claimed = await db
    .update(S.exam)
    .set({ job, jobError: null, jobStartedAt: new Date() })
    .where(and(eq(S.exam.id, examId), isNull(S.exam.job)))
    .returning({ id: S.exam.id });
  if (!claimed.length) return t("The AI is still working on this exam. Wait until it finishes.");
  if (!(await takeAllowance(teacherId))) {
    await db.update(S.exam).set({ job: null }).where(eq(S.exam.id, examId));
    return t("You have reached today's AI usage limit. Try again tomorrow.");
  }
  return null;
}

async function endJob(examId: string, teacherId: string, error: string | null, refund = false) {
  await db.update(S.exam).set({ job: null, jobError: error, updatedAt: new Date() }).where(eq(S.exam.id, examId));
  if (refund) await refundAllowance(teacherId).catch(() => undefined);
}

/** One AI call that returns parsed JSON; a reply that is not valid JSON is retried once. */
async function ask<T>(teacherId: string, provider: ProviderChoice, prompt: string, parse: (text: string) => T): Promise<T> {
  const once = async () => parse((await generateText({ system: EXAM_SYSTEM, prompt, provider, owner: teacherId })).text);
  try {
    return await once();
  } catch (e) {
    if (!(e instanceof AiError) || !/format could not be read/i.test(e.message)) throw e;
    return once();
  }
}

/** AI writes the blueprint (kisi-kisi) from the chosen TP and composition. Replaces the current rows. */
export async function startKisi(examId: string, data: unknown): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = jobSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const e = await getOwnedExam(teacher.id, examId);
  if (!e) return fail(t("Exam not found."));
  if (e.tps.length === 0) return fail(t("Choose at least one TP first."));
  const comp = readComposition(e.composition);
  if (totalCount(comp) === 0) return fail(t("Plan at least one question."));

  const busy = await claimJob(e.id, teacher.id, "kisi", p.data.provider);
  if (busy) return fail(busy);

  const { provider, catatan } = p.data;
  after(async () => {
    try {
      const rows = await ask(teacher.id, provider, kisiPrompt(e.info, e.tps, comp, catatan), (txt) => parseKisi(txt, comp, e.tps));
      if (rows.length === 0) throw new AiError("The AI did not return any blueprint rows. Try again.");
      await db.delete(S.examItem).where(eq(S.examItem.examId, e.id));
      await db.insert(S.examItem).values(rows.map((r, i) => ({ examId: e.id, position: i, ...r })));
      const short = rows.length < totalCount(comp) ? "The AI wrote fewer rows than planned. Add the missing rows yourself or run it again." : null;
      await endJob(e.id, teacher.id, short);
    } catch (err) {
      console.error("[exam] kisi failed", err);
      await endJob(e.id, teacher.id, aiErrorMessage(err), true);
    }
  });
  refresh();
  return succeed();
}

const BATCH = 8;

/** AI writes a question for every blueprint row that has none yet; each lands in the question bank. */
export async function startSoal(examId: string, data: unknown): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = jobSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const e = await getOwnedExam(teacher.id, examId);
  if (!e) return fail(t("Exam not found."));
  const items = await listExamItems(e.id);
  if (items.length === 0) return fail(t("Make the blueprint (kisi-kisi) first."));
  const empty = items.map((r, i) => ({ ...r, no: i + 1 })).filter((r) => !r.item.questionId);
  if (empty.length === 0) return fail(t("Every blueprint row already has a question."));

  const busy = await claimJob(e.id, teacher.id, "soal", p.data.provider);
  if (busy) return fail(busy);

  const { provider, catatan, gambar } = p.data;
  const comp = readComposition(e.composition);
  const meta = { kelas: e.info.kelas || null, semester: semesterGanjilGenap(e.info.semester), pgOptions: comp.pgOptions };
  after(async () => {
    let written = 0;
    let firstError: string | null = null;
    for (const section of EXAM_SECTIONS) {
      const rows = empty.filter((r) => r.item.section === section);
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const targets: SoalTarget[] = chunk.map((r) => ({ no: r.no, section, tp: r.item.tp, materi: r.item.materi, indikator: r.item.indikator, level: r.item.level }));
        try {
          const got = await ask(teacher.id, provider, soalPrompt(e.info, comp, section, targets, catatan, gambar), parseSoal);
          for (const r of chunk) {
            const raw = got.get(r.no);
            const q = raw ? toExamQuestion(raw, section, targets.find((x) => x.no === r.no)!, meta) : null;
            if (!q) continue;
            const [fresh] = await db.insert(S.question).values({ teacherId: teacher.id, ...toDbValues(normalize(q)) }).returning({ id: S.question.id });
            // Only fill the row if the teacher did not link another question meanwhile.
            await db.update(S.examItem).set({ questionId: fresh.id }).where(and(eq(S.examItem.id, r.item.id), isNull(S.examItem.questionId)));
            written++;
          }
        } catch (err) {
          console.error("[exam] soal batch failed", section, err);
          firstError ??= aiErrorMessage(err);
        }
      }
    }
    const missing = empty.length - written;
    const error = missing === 0 ? null : written === 0 ? (firstError ?? "The AI could not write the questions. Try again.") : 'Some questions could not be written. Run "Write questions" again to fill the empty rows.';
    await endJob(e.id, teacher.id, error, written === 0);
  });
  refresh();
  return succeed();
}

/**
 * AI looks over the exam's questions and adds an image where it fits: notation it writes (drawn into a PNG by the
 * exam page), or a note describing a picture the teacher should upload. Questions that already have an image, or
 * that students have already answered, are left alone.
 */
export async function startGambar(examId: string, data: unknown): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = jobSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const e = await getOwnedExam(teacher.id, examId);
  if (!e) return fail(t("Exam not found."));
  const items = (await listExamItems(e.id)).map((r, i) => ({ ...r, no: i + 1 }));
  const ids = items.map((r) => r.question?.id).filter((x): x is string => Boolean(x));
  const answered = new Set(ids.length ? (await db.selectDistinct({ id: S.answer.questionId }).from(S.answer).where(inArray(S.answer.questionId, ids))).map((r) => r.id) : []);
  const targets = items.filter((r) => r.question && !r.question.mediaKey && !r.question.notation && !r.question.imageHint && !answered.has(r.question.id));
  if (targets.length === 0) return fail(t("No questions to check: they already have an image or have been answered by students."));

  const busy = await claimJob(e.id, teacher.id, "gambar", p.data.provider);
  if (busy) return fail(busy);

  const { provider } = p.data;
  after(async () => {
    let added = 0;
    let undrawable = 0;
    let firstError: string | null = null;
    for (let i = 0; i < targets.length; i += 10) {
      const chunk = targets.slice(i, i + 10);
      try {
        const got = await ask(teacher.id, provider, gambarPrompt(e.info, chunk.map((r) => ({ no: r.no, type: SECTION_META[r.item.section].nama, prompt: r.question!.prompt, options: r.question!.options, matchRows: r.question!.matchRows, answerKey: r.question!.answerKey }))), parseSoal);
        for (const r of chunk) {
          const raw = got.get(r.no);
          if (!raw) continue;
          const g = readGambar(raw.gambar);
          if (g === "invalid") undrawable++;
          if (g === "invalid" || (!g.notation && !g.imageHint)) continue;
          const q = r.question!;
          const proposed = typeof raw.pertanyaan === "string" ? raw.pertanyaan.trim().slice(0, 2000) : "";
          // A rewrite that lost the actual question (e.g. only "Perhatikan notasi berikut!") keeps the original question under it.
          const prompt = !proposed ? q.prompt : proposed.length < q.prompt.length * 0.6 ? `${proposed}\n${q.prompt}`.slice(0, 2000) : proposed;
          // Choices written as notation code may be replaced by the labels drawn in the image: same count and order, so the key still holds.
          const newOptions = Array.isArray(raw.opsi) ? raw.opsi.map((o) => (typeof o === "string" ? o.trim().slice(0, 300) : "")) : null;
          const options = newOptions && q.options && newOptions.length === q.options.length && newOptions.every(Boolean) && g.notation ? newOptions : q.options;
          const explanation = typeof raw.pembahasan === "string" && raw.pembahasan.trim() ? raw.pembahasan.trim().slice(0, 2000) : q.explanation;
          await db.update(S.question).set({ notation: g.notation, imageHint: g.imageHint, prompt, options, explanation, updatedAt: new Date() }).where(and(eq(S.question.id, q.id), isNull(S.question.mediaKey)));
          added++;
        }
      } catch (err) {
        console.error("[exam] gambar batch failed", err);
        firstError ??= aiErrorMessage(err);
      }
    }
    const error =
      added > 0
        ? undrawable > 0
          ? "Some notation the AI wrote could not be drawn. Run it again for the rest."
          : null
        : (firstError ?? (undrawable > 0 ? "The notation the AI wrote could not be drawn. Try again." : "The AI found no questions that need an image."));
    await endJob(e.id, teacher.id, error, Boolean(firstError) && added === 0);
  });
  refresh();
  return succeed();
}

/** Put an uploaded/drawn image on a question of this teacher (null removes it). A real image replaces the "picture needed" note. */
export async function setQuestionImage(questionId: string, key: string | null): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const q = await getOwnedQuestion(teacher.id, questionId);
  if (!q) return fail(t("Question not found."));
  if (key !== null && !isValidMediaKey(key, teacher.id)) return fail(t("Invalid media file."));
  await db
    .update(S.question)
    .set(key ? { mediaKey: key, imageHint: null, updatedAt: new Date() } : { mediaKey: null, notation: null, imageHint: null, updatedAt: new Date() })
    .where(eq(S.question.id, q.id));
  if (q.mediaKey && q.mediaKey !== key) await deleteMediaIfOrphaned(q.mediaKey);
  refresh();
  return succeed(key ? t("Image added to the question.") : t("Image removed from the question."));
}

/** Polled by the exam page while a job runs. */
export async function examJobStatus(examId: string): Promise<ActionResult<{ job: string | null; jobError: string | null; filled: number; total: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const e = await getOwnedExam(teacher.id, examId);
  if (!e) return fail(t("Exam not found."));
  const items = await db.select({ questionId: S.examItem.questionId }).from(S.examItem).where(eq(S.examItem.examId, e.id));
  return succeed(undefined, { job: e.job, jobError: e.jobError, filled: items.filter((i) => i.questionId).length, total: items.length });
}

export async function dismissExamError(examId: string): Promise<ActionResult> {
  const teacher = await requireTeacher();
  const e = await getOwnedExam(teacher.id, examId);
  if (e) await db.update(S.exam).set({ jobError: null }).where(eq(S.exam.id, e.id));
  refresh();
  return succeed();
}

/* ------------------------------------------------------------------ blueprint rows */

async function getOwnedItem(teacherId: string, itemId: string) {
  if (!isUuid(itemId)) return null;
  const [r] = await db
    .select({ item: S.examItem })
    .from(S.examItem)
    .innerJoin(S.exam, eq(S.exam.id, S.examItem.examId))
    .where(and(eq(S.examItem.id, itemId), eq(S.exam.teacherId, teacherId)))
    .limit(1);
  return r?.item ?? null;
}

const itemSchema = z.object({
  tp: z.string().trim().max(600).optional(),
  materi: z.string().trim().max(300).optional(),
  indikator: z.string().trim().max(600).optional(),
  level: z.union([z.enum(COGNITIVE_LEVELS as [string, ...string[]]), z.literal("")]).optional(),
});

export async function saveExamItem(itemId: string, data: unknown): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = itemSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const item = await getOwnedItem(teacher.id, itemId);
  if (!item) return fail(t("Row not found."));
  await db.update(S.examItem).set(p.data).where(eq(S.examItem.id, item.id));
  return succeed();
}

export async function addExamItem(examId: string, section: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const e = await getOwnedExam(teacher.id, examId);
  if (!e) return fail(t("Exam not found."));
  const s = EXAM_SECTIONS.find((x) => x === section);
  if (!s) return fail(t("Invalid data."));
  await db.insert(S.examItem).values({ examId: e.id, section: s, position: await nextPosition(e.id), tp: e.tps[0] ?? "" });
  refresh();
  return succeed();
}

export async function deleteExamItem(itemId: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const item = await getOwnedItem(teacher.id, itemId);
  if (!item) return fail(t("Row not found."));
  await db.delete(S.examItem).where(eq(S.examItem.id, item.id));
  refresh();
  return succeed(t("Row deleted. Its question stays in the question bank."));
}

/** Put a bank question on a blueprint row (null removes it). The question type must fit the row's section. */
export async function linkExamQuestion(itemId: string, questionId: string | null): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const item = await getOwnedItem(teacher.id, itemId);
  if (!item) return fail(t("Row not found."));
  if (questionId === null) {
    await db.update(S.examItem).set({ questionId: null }).where(eq(S.examItem.id, item.id));
    refresh();
    return succeed(t("Question removed from this row. It stays in the question bank."));
  }
  if (!isUuid(questionId)) return fail(t("Question not found."));
  const [q] = await db.select().from(S.question).where(and(eq(S.question.id, questionId), eq(S.question.teacherId, teacher.id))).limit(1);
  if (!q) return fail(t("Question not found."));
  if (q.type !== SECTION_META[item.section].type) return fail(t("This question type does not fit this section."));
  await db
    .update(S.examItem)
    .set({ questionId: q.id, tp: item.tp || q.topic || "", level: item.level || q.level || "" })
    .where(eq(S.examItem.id, item.id));
  refresh();
  return succeed(t("Question added to the exam."));
}

/**
 * Take the questions of a quiz: each goes to the first empty row of its section, or a new row when the section is full.
 * Questions already in the exam and types an exam cannot use (audio, MIDI…) are skipped.
 */
export async function fillExamFromQuiz(examId: string, quizId: string): Promise<ActionResult<{ placed: number; added: number; skipped: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const e = await getOwnedExam(teacher.id, examId);
  if (!e) return fail(t("Exam not found."));
  const k = await getOwnedQuiz(teacher.id, quizId);
  if (!k) return fail(t("Quiz not found."));

  const questions = await db
    .select({ q: S.question })
    .from(S.quizQuestion)
    .innerJoin(S.question, eq(S.question.id, S.quizQuestion.questionId))
    .where(eq(S.quizQuestion.quizId, k.id))
    .orderBy(asc(S.quizQuestion.position));
  const items = await listExamItems(e.id);
  const used = new Set(items.map((r) => r.item.questionId).filter(Boolean));
  const taken = new Set<string>();
  let position = await nextPosition(e.id);
  let placed = 0;
  let added = 0;
  let skipped = 0;
  for (const { q } of questions) {
    const section = sectionForType(q.type);
    if (!section || used.has(q.id)) {
      skipped++;
      continue;
    }
    used.add(q.id);
    const slot = items.find((r) => r.item.section === section && !r.item.questionId && !taken.has(r.item.id));
    if (slot) {
      taken.add(slot.item.id);
      await db
        .update(S.examItem)
        .set({ questionId: q.id, tp: slot.item.tp || q.topic || "", level: slot.item.level || q.level || "" })
        .where(eq(S.examItem.id, slot.item.id));
      placed++;
    } else {
      await db.insert(S.examItem).values({ examId: e.id, section, position: position++, tp: q.topic ?? "", materi: "", indikator: "", level: q.level ?? "", questionId: q.id });
      added++;
    }
  }
  refresh();
  if (placed + added === 0) return fail(t("No usable questions in this quiz (exams use multiple choice, complex multiple choice, matching, short answer and essay questions)."));
  return succeed(t("{0} questions taken from the quiz ({1} into empty rows, {2} as new rows).", placed + added, placed, added), { placed, added, skipped });
}

/* ------------------------------------------------------------------ publish online */

const publishSchema = z
  .object({
    classroomIds: z.array(z.uuid()).min(1, "Choose at least one class").max(50),
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
    description: z.string().trim().max(500).nullable().optional(),
    startsAt: z.string().nullable().optional(),
    endsAt: z.string().nullable().optional(),
    durationMinutes: z.number().int().min(1).max(300).nullable().optional(),
    published: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const a = fromWibInput(v.startsAt);
    const b = fromWibInput(v.endsAt);
    if (a && b && b <= a) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end time must be after the start time" });
  });

/**
 * Run the exam online: one quiz per class (one attempt, no instant feedback). Each section's weight is spread over its
 * questions, so the grade (0-100) follows the exam weights; complex choice and matching earn partial points.
 */
export async function publishExam(examId: string, data: unknown): Promise<ActionResult<{ count: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = publishSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const v = p.data;
  const e = await getOwnedExam(teacher.id, examId);
  if (!e) return fail(t("Exam not found."));
  if (e.job) return fail(t("The AI is still working on this exam. Wait until it finishes."));

  const items = await listExamItems(e.id);
  if (items.length === 0) return fail(t("This exam has no questions yet."));
  const missing = items.filter((r) => !r.question).length;
  if (missing) return fail(t("{0} blueprint rows have no question yet. Fill or delete them first.", missing));
  const noPicture = items.filter((r) => r.question && !r.question.mediaKey && (r.question.imageHint || r.question.notation)).length;
  if (noPicture) return fail(t("{0} questions still need their image. Add or remove it first.", noPicture));

  const comp = readComposition(e.composition);
  const filled = Object.fromEntries(EXAM_SECTIONS.map((s) => [s, items.filter((r) => r.item.section === s).length])) as Record<ExamSection, number>;
  const weight = EXAM_SECTIONS.reduce((n, s) => n + (filled[s] > 0 ? comp[s].weight : 0), 0);
  if (Math.abs(weight - 100) > 0.01) return fail(t("The weights of the sections that have questions add up to {0}%, not 100%. Fix the weights first.", Math.round(weight * 100) / 100));
  const empties = EXAM_SECTIONS.filter((s) => filled[s] > 0 && comp[s].weight === 0);
  if (empties.length) return fail(t("Give a weight to every section that has questions ({0}).", empties.map((s) => SECTION_META[s].nama).join(", ")));
  const points = pointsPerQuestion(comp, filled);

  const ids = [...new Set(v.classroomIds)];
  const owned = await db.select({ id: S.classroom.id }).from(S.classroom).where(and(eq(S.classroom.teacherId, teacher.id), inArray(S.classroom.id, ids)));
  if (owned.length !== ids.length) return fail(t("Invalid class."));

  for (const classroomId of ids) {
    const [k] = await db
      .insert(S.quiz)
      .values({
        teacherId: teacher.id,
        classroomId,
        examId: e.id,
        title: v.title,
        description: v.description || null,
        startsAt: fromWibInput(v.startsAt),
        endsAt: fromWibInput(v.endsAt),
        durationMinutes: v.durationMinutes ?? null,
        maxAttempts: 1,
        instantFeedback: false,
        published: v.published,
      })
      .returning({ id: S.quiz.id });
    await db.insert(S.quizQuestion).values(items.map((r, position) => ({ quizId: k.id, questionId: r.question!.id, position, points: points[r.item.section] })));
  }
  revalidatePath("/", "layout");
  return succeed(v.published ? t("Exam published to {0} classes.", ids.length) : t("Exam saved as a draft quiz in {0} classes.", ids.length), { count: ids.length });
}
