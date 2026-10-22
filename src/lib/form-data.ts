import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { dailyLimit, providerOptions, remainingAllowance } from "./ai";
import { daftarTp, infoTp, nomorSemester, nomorTpUrut } from "./perangkat/generator";
import { docContext } from "./perangkat/store";
import { today } from "./utils";

/** One BAB (unit) of a semester, holding the TP that belong to it. */
export type TopicGroup = { semester: string; /** 1 or 2 when the semester text can be read, else null. */ semesterNo: number | null; babNomor: string; babJudul: string; tp: string[]; /** Grade level of the CP-TP-ATP these TP come from ("" when not set). */ kelas: string };

/** A free-text topic, with the grade levels of the lessons that use it (empty when none is set). */
export type OutsideTopic = { topic: string; kelas: string[] };

/** Topic suggestions for a teacher, split by where they come from. */
export type TopicSuggestions = {
  /** Free-text topics already typed on materials/questions that don't match any TP. */
  outsideTp: OutsideTopic[];
  /** Titles of the teacher's saved lessons, so a lesson can be used as the topic directly. */
  materials: OutsideTopic[];
  /** TP from the teacher's saved CP-TP-ATP, grouped by semester then BAB. */
  groups: TopicGroup[];
};

/**
 * Topic suggestions for a teacher: the Tujuan Pembelajaran (TP) from their saved CP-TP-ATP in Perangkat
 * Ajar (grouped by semester/BAB), plus whatever free-text topics they already typed on materials/questions
 * that aren't a TP. Perangkat Ajar is the reference, but a teacher can still type a topic that isn't a TP yet.
 */
export async function topicSuggestions(teacherId: string): Promise<TopicSuggestions> {
  const [cpTpAtp, materialTopic, questionTopic] = await Promise.all([
    db
      .select({ data: schema.teachingDoc.data, context: schema.teachingDoc.context })
      .from(schema.teachingDoc)
      .where(and(eq(schema.teachingDoc.teacherId, teacherId), eq(schema.teachingDoc.kind, "cp_tp_atp"), eq(schema.teachingDoc.status, "done"))),
    db.selectDistinct({ t: schema.material.topic, title: schema.material.title, kelas: schema.material.kelas }).from(schema.material).where(eq(schema.material.teacherId, teacherId)),
    db.selectDistinct({ t: schema.question.topic }).from(schema.question).where(eq(schema.question.teacherId, teacherId)),
  ]);

  const tpSeen = new Set<string>();
  const tpTexts = new Set<string>();
  const groupByKey = new Map<string, TopicGroup>();
  for (const row of cpTpAtp) {
    const info = infoTp(row.data);
    const kelas = (docContext(row).kelas ?? "").trim();
    for (const tp of daftarTp(row.data)) {
      const tpKey = `${kelas}\u0000${tp}`;
      if (tpSeen.has(tpKey)) continue;
      tpSeen.add(tpKey);
      tpTexts.add(tp);
      const meta = info[tp];
      const semester = meta?.semester || "Belum ada semester";
      const babNomor = meta?.bab_nomor ?? "";
      const babJudul = meta?.bab_judul ?? "";
      const key = `${kelas}\u0000${semester}\u0000${babNomor}\u0000${babJudul}`;
      let group = groupByKey.get(key);
      if (!group) {
        group = { semester, semesterNo: nomorSemester(semester), babNomor, babJudul, tp: [], kelas };
        groupByKey.set(key, group);
      }
      group.tp.push(tp);
    }
  }
  const groups = [...groupByKey.values()]
    .map((g) => ({ ...g, tp: g.tp.sort((a, b) => nomorTpUrut(a) - nomorTpUrut(b)) }))
    .sort(
      (a, b) =>
        a.kelas.localeCompare(b.kelas, undefined, { numeric: true }) ||
        (nomorSemester(a.semester) ?? 99) - (nomorSemester(b.semester) ?? 99) ||
        (Number(a.babNomor) || 99) - (Number(b.babNomor) || 99),
    );

  // Questions have no grade level of their own, so a topic's kelas comes from the lessons using it.
  const outsideTp = withKelas([...materialTopic, ...questionTopic.map((x) => ({ ...x, kelas: null }))].filter((x) => !tpTexts.has(x.t ?? "")));
  const materials = withKelas(materialTopic.map((x) => ({ t: x.title, kelas: x.kelas })));

  return { outsideTp, groups, materials };
}

/** Merge rows of (text, kelas) into one entry per text holding every kelas it was seen with, sorted by text. */
function withKelas(rows: { t: string | null; kelas: string | null }[]): OutsideTopic[] {
  const byNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  const kelasByTopic = new Map<string, Set<string>>();
  for (const { t, kelas } of rows) {
    const topic = t?.trim();
    if (!topic) continue;
    const set = kelasByTopic.get(topic) ?? new Set<string>();
    if (kelas?.trim()) set.add(kelas.trim());
    kelasByTopic.set(topic, set);
  }
  return [...kelasByTopic].map(([topic, kelas]) => ({ topic, kelas: [...kelas].sort(byNum) })).sort((a, b) => byNum(a.topic, b.topic));
}

/**
 * Data the lesson form needs: the teacher's classes, topic suggestions, their finished Modul Ajar (so the
 * "Generate with AI" panel can ground the lesson on one), and what it needs to call the AI.
 */
export async function materialFormData(teacherId: string) {
  const [classroom, topics, modulAjarDocs, providers, allowance] = await Promise.all([
    db.select({ id: schema.classroom.id, name: schema.classroom.name }).from(schema.classroom).where(eq(schema.classroom.teacherId, teacherId)).orderBy(schema.classroom.name),
    topicSuggestions(teacherId),
    db
      .select({ id: schema.teachingDoc.id, title: schema.teachingDoc.title })
      .from(schema.teachingDoc)
      .where(and(eq(schema.teachingDoc.teacherId, teacherId), eq(schema.teachingDoc.kind, "modul_ajar"), eq(schema.teachingDoc.status, "done")))
      .orderBy(desc(schema.teachingDoc.createdAt)),
    providerOptions(),
    remainingAllowance(teacherId),
  ]);
  return { classroom, topicSuggestions: topics, today: today(), modulAjarDocs, providers, remaining: allowance.remaining, limit: await dailyLimit() };
}

/** Everything the practice material form needs: the teacher's classes, lessons usable as an AI source, and AI settings. */
export async function practiceMaterialFormData(teacherId: string) {
  const [classroom, lessons, providers, allowance] = await Promise.all([
    db.select({ id: schema.classroom.id, name: schema.classroom.name }).from(schema.classroom).where(eq(schema.classroom.teacherId, teacherId)).orderBy(schema.classroom.name),
    db
      .select({ id: schema.material.id, title: schema.material.title })
      .from(schema.material)
      .where(and(eq(schema.material.teacherId, teacherId), ne(schema.material.content, "")))
      .orderBy(desc(schema.material.updatedAt)),
    providerOptions(),
    remainingAllowance(teacherId),
  ]);
  return { classroom, lessons, providers, remaining: allowance.remaining, limit: await dailyLimit() };
}
