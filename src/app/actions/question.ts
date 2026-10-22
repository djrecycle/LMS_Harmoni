"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { deleteMediaIfOrphaned, isValidMediaKey, getOwnedQuestion } from "@/lib/access";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { requireTeacher } from "@/lib/session";
import { midiToNote, noteToMidi } from "@/lib/music";
import { questionInputSchema, type QuestionInput } from "@/lib/questions";
import { topicSuggestions } from "@/lib/form-data";
import { semesterGanjilGenap } from "@/lib/perangkat/generator";
import { docContext } from "@/lib/perangkat/store";
import { obj, str } from "@/lib/perangkat/util";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/", "layout");

/** Normalize MIDI key notes to standard notation (e.g. Db4 -> C#4). */
function normalize(v: QuestionInput): QuestionInput {
  if (v.sound?.kind === "notes") v = { ...v, sound: { ...v.sound, notes: v.sound.notes.map((n) => midiToNote(noteToMidi(n) ?? 60)) } };
  if (v.answerKey.kind === "midi") {
    return { ...v, answerKey: { ...v.answerKey, note: v.answerKey.note.map((n) => midiToNote(noteToMidi(n) ?? 60)) } };
  }
  if (v.answerKey.kind === "fill_in") {
    return { ...v, answerKey: { ...v.answerKey, answer: v.answerKey.answer.map((j) => j.trim()).filter(Boolean) } };
  }
  return v;
}

function toDbValues(v: QuestionInput) {
  return {
    type: v.type,
    answerType: v.answerType,
    prompt: v.prompt,
    mediaKey: v.mediaKey || null,
    sound: v.type === "audio" ? (v.sound ?? null) : null,
    options: v.answerType === "multiple_choice" ? (v.options ?? []) : null,
    answerKey: v.answerKey,
    explanation: v.explanation || null,
    topic: v.topic || null,
    kelas: v.kelas || null,
    semester: v.semester ?? null,
    points: v.points,
  };
}

/** Save (create/update) one question. An empty `id` means a new question. */
export async function saveQuestion(data: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = questionInputSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const v = normalize(p.data);
  if (!isValidMediaKey(v.mediaKey, teacher.id)) return fail(t("Invalid media file."));

  if (id) {
    const current = await getOwnedQuestion(teacher.id, id);
    if (!current) return fail(t("Question not found."));
    await db.update(S.question).set({ ...toDbValues(v), updatedAt: new Date() }).where(eq(S.question.id, current.id));
    if (current.mediaKey && current.mediaKey !== v.mediaKey) await deleteMediaIfOrphaned(current.mediaKey);
    refresh();
    return succeed(t("Question updated."), { id: current.id });
  }
  const [fresh] = await db.insert(S.question).values({ teacherId: teacher.id, ...toDbValues(v) }).returning({ id: S.question.id });
  refresh();
  return succeed(t("Question saved to the question bank."), { id: fresh.id });
}

/** Save many questions at once (used by AI drafts). All are validated first; if one fails, none are saved. */
export async function saveQuestionMany(list: unknown[]): Promise<ActionResult<{ count: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  if (!Array.isArray(list) || list.length === 0 || list.length > 50) return fail(t("There are no questions to save."));
  const valid: QuestionInput[] = [];
  for (let i = 0; i < list.length; i++) {
    const p = questionInputSchema.safeParse(list[i]);
    if (!p.success) return fail(t("Question {0}: {1}", i + 1, p.error.issues[0]?.message ?? t("invalid")));
    if (!isValidMediaKey(p.data.mediaKey, teacher.id)) return fail(t("Question {0}: invalid media file.", i + 1));
    valid.push(normalize(p.data));
  }
  await db.insert(S.question).values(valid.map((v) => ({ teacherId: teacher.id, ...toDbValues(v) })));
  refresh();
  return succeed(t("{0} questions saved to the question bank.", valid.length), { count: valid.length });
}

const bulkMetaSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  /** undefined = leave as is, null = clear, string = set. */
  kelas: z.string().trim().min(1).max(40).nullable().optional(),
  semester: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
});

/** Set the class and/or semester of many questions at once. Fields left undefined are not changed. */
export async function bulkSetQuestionMeta(data: unknown): Promise<ActionResult<{ count: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = bulkMetaSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const { ids, kelas, semester } = p.data;
  const set: { kelas?: string | null; semester?: number | null; updatedAt: Date } = { updatedAt: new Date() };
  if (kelas !== undefined) set.kelas = kelas;
  if (semester !== undefined) set.semester = semester;
  if (kelas === undefined && semester === undefined) return fail(t("Choose a class or semester to change."));
  const updated = await db
    .update(S.question)
    .set(set)
    .where(and(eq(S.question.teacherId, teacher.id), inArray(S.question.id, [...new Set(ids)])))
    .returning({ id: S.question.id });
  refresh();
  return succeed(t("{0} questions updated.", updated.length), { count: updated.length });
}

/**
 * Fill the empty class/semester of existing questions from their topic: a TP from Perangkat Ajar gives class + semester,
 * a lesson (by title or topic) gives its class. Values already set are never overwritten, and a topic that points to
 * more than one class/semester is skipped instead of guessed.
 */
export async function autoFillQuestionMeta(): Promise<ActionResult<{ filled: number; skipped: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const [questions, suggestions, materials, docs] = await Promise.all([
    db
      .select({ id: S.question.id, topic: S.question.topic, kelas: S.question.kelas, semester: S.question.semester })
      .from(S.question)
      .where(eq(S.question.teacherId, teacher.id)),
    topicSuggestions(teacher.id),
    db.select({ title: S.material.title, topic: S.material.topic, kelas: S.material.kelas }).from(S.material).where(eq(S.material.teacherId, teacher.id)),
    db
      .select({ title: S.teachingDoc.title, data: S.teachingDoc.data, context: S.teachingDoc.context })
      .from(S.teachingDoc)
      .where(and(eq(S.teachingDoc.teacherId, teacher.id), eq(S.teachingDoc.status, "done"))),
  ]);

  /** Perangkat Ajar documents (Modul Ajar, Materi…) by every name a question topic may have copied from them. */
  const docHints = docs.map((d) => {
    const data = obj(d.data);
    const ctx = docContext(d);
    // Imported questions store the first 80 characters of one of these as their topic.
    const names = [d.title, str(data.judul), str(data.judul_bab), str(data.materi_bab), str(ctx.bab_judul), str(ctx.topik)].filter(Boolean);
    return { names: new Set(names.flatMap((n) => [n, n.slice(0, 80)]).map((n) => n.trim().toLowerCase())), kelas: ctx.kelas?.trim() ?? "", semester: semesterGanjilGenap(ctx.semester) };
  });

  const norm = (x: string | null | undefined) => (x ?? "").trim().toLowerCase();
  /** All class/semester hints for one text (a TP or a lesson title/topic). */
  function hintsFor(topic: string, depth = 0): { kelas: Set<string>; semester: Set<number> } {
    const kelas = new Set<string>();
    const semester = new Set<number>();
    const key = norm(topic);
    for (const g of suggestions.groups) {
      if (!g.tp.some((x) => norm(x) === key)) continue;
      if (g.kelas.trim()) kelas.add(g.kelas.trim());
      if (g.semesterNo === 1 || g.semesterNo === 2) semester.add(g.semesterNo);
    }
    for (const d of docHints) {
      if (!d.names.has(key)) continue;
      if (d.kelas) kelas.add(d.kelas);
      if (d.semester) semester.add(d.semester);
    }
    for (const m of materials) {
      if (norm(m.title) !== key && norm(m.topic) !== key) continue;
      if (m.kelas?.trim()) kelas.add(m.kelas.trim());
      // A lesson titled like the question topic may itself be tagged with a TP: take that TP's semester too.
      if (depth === 0 && m.topic && norm(m.topic) !== key) for (const s of hintsFor(m.topic, 1).semester) semester.add(s);
    }
    return { kelas, semester };
  }

  let filled = 0;
  let skipped = 0;
  const cache = new Map<string, ReturnType<typeof hintsFor>>();
  for (const q of questions) {
    if (q.kelas && q.semester) continue;
    if (!q.topic?.trim()) {
      skipped++;
      continue;
    }
    const h = cache.get(norm(q.topic)) ?? hintsFor(q.topic);
    cache.set(norm(q.topic), h);
    const set: { kelas?: string; semester?: number } = {};
    if (!q.kelas && h.kelas.size === 1) set.kelas = [...h.kelas][0];
    if (!q.semester && h.semester.size === 1) set.semester = [...h.semester][0];
    if (set.kelas === undefined && set.semester === undefined) {
      skipped++;
      continue;
    }
    await db.update(S.question).set({ ...set, updatedAt: new Date() }).where(eq(S.question.id, q.id));
    filled++;
  }
  refresh();
  if (filled === 0) return fail(t("No class or semester could be found from the TP / topics. Set them with the checkboxes instead."));
  return succeed(t("{0} questions filled automatically. {1} could not be matched.", filled, skipped), { filled, skipped });
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const question = await getOwnedQuestion(teacher.id, id);
  if (!question) return fail(t("Question not found."));

  // Do not delete questions students have already answered: their grades would be lost too.
  const [taken] = await db
    .select({ id: S.answer.id })
    .from(S.answer)
    .where(and(eq(S.answer.questionId, question.id)))
    .limit(1);
  if (taken) return fail(t("Students have already answered this question, so it cannot be deleted (their grades would be lost). Edit its content instead if needed."));

  await db.delete(S.question).where(eq(S.question.id, question.id));
  await deleteMediaIfOrphaned(question.mediaKey);
  refresh();
  return succeed(t("Question deleted."));
}
