import { and, asc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Translate } from "@/i18n";
import { summarizeAttempts, type KindSummary, type PracticeAttempt } from "@/lib/practice-analysis";

const S = schema;

export type PracticeRecapRow = {
  studentId: string;
  name: string;
  classIds: string[];
  classNames: string[];
  attempts: number;
  /** Attempts saved without a lesson (the student's Practice menu, or lesson practice saved before scores were linked to lessons). */
  outside: number;
  lastAt: string | null;
  kinds: KindSummary[];
  analysis: { text: string; source: "rule" | "ai"; attempts: number; createdAt: string } | null;
};

/**
 * Practice recap of one lesson: every student in the classes the lesson is assigned to, with their practice
 *  scores grouped by kind and the saved analysis (if any). Besides the scores linked to this lesson it counts the
 *  student's practice saved without a lesson (Practice menu, or older lesson practice) from the day the lesson was
 *  published in their class. The caller checks lesson ownership.
 */
export async function loadPracticeRecap(t: Translate, materialId: string): Promise<{ classes: { id: string; name: string }[]; rows: PracticeRecapRow[]; attempts: Map<string, PracticeAttempt[]> }> {
  const classes = await db
    .select({ id: S.classroom.id, name: S.classroom.name, date: S.classroomMaterial.date })
    .from(S.classroomMaterial)
    .innerJoin(S.classroom, eq(S.classroom.id, S.classroomMaterial.classroomId))
    .where(eq(S.classroomMaterial.materialId, materialId))
    .orderBy(asc(S.classroom.name));

  const members = classes.length
    ? await db
        .select({ studentId: S.classroomMembership.studentId, classId: S.classroomMembership.classroomId, name: S.user.name })
        .from(S.classroomMembership)
        .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
        .where(
          inArray(
            S.classroomMembership.classroomId,
            classes.map((c) => c.id),
          ),
        )
    : [];
  // Publish day (WIB midnight) of the lesson in each class; a student's window starts at their earliest class.
  const publishedAt = new Map(classes.map((c) => [c.id, new Date(`${c.date}T00:00:00+07:00`)]));
  const earliest = classes.length ? new Date(Math.min(...[...publishedAt.values()].map((d) => d.getTime()))) : new Date();
  const studentIds = [...new Set(members.map((m) => m.studentId))];

  const [results, analyses] = await Promise.all([
    studentIds.length
      ? db
          .select({ studentId: S.practiceResult.studentId, kind: S.practiceResult.kind, score: S.practiceResult.score, detail: S.practiceResult.detail, createdAt: S.practiceResult.createdAt, materialId: S.practiceResult.materialId })
          .from(S.practiceResult)
          .where(
            and(
              inArray(S.practiceResult.studentId, studentIds),
              or(eq(S.practiceResult.materialId, materialId), and(isNull(S.practiceResult.materialId), gte(S.practiceResult.createdAt, earliest))),
            ),
          )
          .orderBy(asc(S.practiceResult.createdAt))
      : Promise.resolve([]),
    db.select().from(S.practiceAnalysis).where(eq(S.practiceAnalysis.materialId, materialId)),
  ]);

  const startOf = new Map<string, number>();
  for (const m of members) {
    const at = publishedAt.get(m.classId)!.getTime();
    startOf.set(m.studentId, Math.min(at, startOf.get(m.studentId) ?? Infinity));
  }
  const attempts = new Map<string, PracticeAttempt[]>();
  for (const r of results) {
    const inLesson = r.materialId === materialId;
    if (!inLesson && r.createdAt.getTime() < (startOf.get(r.studentId) ?? Infinity)) continue;
    const list = attempts.get(r.studentId) ?? [];
    list.push({ kind: r.kind, score: r.score, detail: r.detail, createdAt: r.createdAt, inLesson });
    attempts.set(r.studentId, list);
  }
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const students = new Map<string, { name: string; classIds: string[] }>();
  for (const m of members) {
    const s = students.get(m.studentId) ?? { name: m.name, classIds: [] };
    s.classIds.push(m.classId);
    students.set(m.studentId, s);
  }
  const analysisOf = new Map(analyses.map((a) => [a.studentId, a]));

  const rows = [...students.entries()]
    .map(([studentId, s]): PracticeRecapRow => {
      const list = attempts.get(studentId) ?? [];
      const a = analysisOf.get(studentId);
      return {
        studentId,
        name: s.name,
        classIds: s.classIds,
        classNames: s.classIds.map((id) => className.get(id) ?? ""),
        attempts: list.length,
        outside: list.filter((a) => !a.inLesson).length,
        lastAt: list.length ? list[list.length - 1].createdAt.toISOString() : null,
        kinds: summarizeAttempts(t, list),
        analysis: a ? { text: a.text, source: a.source, attempts: a.attempts, createdAt: a.createdAt.toISOString() } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { classes: classes.map(({ id, name }) => ({ id, name })), rows, attempts };
}
