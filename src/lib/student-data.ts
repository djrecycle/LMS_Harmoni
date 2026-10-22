import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { round, today } from "./utils";

const S = schema;

export async function studentClassrooms(studentId: string) {
  return db
    .select({ id: S.classroom.id, name: S.classroom.name, description: S.classroom.description, teacher: S.user.name, joinedAt: S.classroomMembership.joinedAt })
    .from(S.classroomMembership)
    .innerJoin(S.classroom, eq(S.classroom.id, S.classroomMembership.classroomId))
    .innerJoin(S.user, eq(S.user.id, S.classroom.teacherId))
    .where(eq(S.classroomMembership.studentId, studentId))
    .orderBy(S.classroom.name);
}

export type StudentMaterial = {
  id: string;
  title: string;
  topic: string | null;
  typeMedia: "text" | "image" | "audio" | "video" | "interactive";
  classroomName: string;
  date: string;
  today: boolean;
  completed: boolean;
};

/** Lessons already published (date <= today) in the student's classes, newest first. Duplicates across classes are merged. */
export async function studentMaterials(studentId: string): Promise<StudentMaterial[]> {
  const day = today();
  const rows = await db
    .select({
      id: S.material.id,
      title: S.material.title,
      topic: S.material.topic,
      typeMedia: S.material.typeMedia,
      classroomName: S.classroom.name,
      date: S.classroomMaterial.date,
    })
    .from(S.classroomMaterial)
    .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.classroomMaterial.classroomId))
    .innerJoin(S.material, eq(S.material.id, S.classroomMaterial.materialId))
    .innerJoin(S.classroom, eq(S.classroom.id, S.classroomMaterial.classroomId))
    .where(and(eq(S.classroomMembership.studentId, studentId), lte(S.classroomMaterial.date, day)))
    .orderBy(desc(S.classroomMaterial.date), S.material.title);

  const unique = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!unique.has(r.id)) unique.set(r.id, r);
  const ids = [...unique.keys()];
  const completed = ids.length
    ? await db
        .select({ materialId: S.materialProgress.materialId })
        .from(S.materialProgress)
        .where(and(eq(S.materialProgress.studentId, studentId), inArray(S.materialProgress.materialId, ids), eq(S.materialProgress.completed, true)))
    : [];
  const completedSet = new Set(completed.map((s) => s.materialId));
  return [...unique.values()].map((r) => ({ ...r, today: r.date === day, completed: completedSet.has(r.id) }));
}

export type StudentQuiz = {
  id: string;
  title: string;
  description: string | null;
  classroomName: string;
  questionCount: number;
  durationMinutes: number | null;
  maxAttempts: number;
  startsAt: Date | null;
  endsAt: Date | null;
  attemptCompleted: number;
  attemptInProgressId: string | null;
  bestGrades: number | null;
  status: "not_started" | "open" | "closed";
  bisaMencoba: boolean;
};

export async function studentQuizzes(studentId: string): Promise<StudentQuiz[]> {
  const rows = await db
    .select({ quiz: S.quiz, classroomName: S.classroom.name })
    .from(S.quiz)
    .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.quiz.classroomId))
    .innerJoin(S.classroom, eq(S.classroom.id, S.quiz.classroomId))
    .where(and(eq(S.classroomMembership.studentId, studentId), eq(S.quiz.published, true)))
    .orderBy(desc(S.quiz.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.quiz.id);
  const [questionRows, attemptRows] = await Promise.all([
    db.select({ quizId: S.quizQuestion.quizId }).from(S.quizQuestion).where(inArray(S.quizQuestion.quizId, ids)),
    db.select().from(S.attempt).where(and(eq(S.attempt.studentId, studentId), inArray(S.attempt.quizId, ids))),
  ]);
  const now = new Date();
  return rows.map(({ quiz, classroomName }) => {
    const p = attemptRows.filter((x) => x.quizId === quiz.id);
    const completed = p.filter((x) => x.status === "completed");
    const inProgress = p.find((x) => x.status === "in_progress");
    const status = quiz.startsAt && quiz.startsAt > now ? "not_started" : quiz.endsAt && quiz.endsAt < now ? "closed" : "open";
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      classroomName,
      questionCount: questionRows.filter((s) => s.quizId === quiz.id).length,
      durationMinutes: quiz.durationMinutes,
      maxAttempts: quiz.maxAttempts,
      startsAt: quiz.startsAt,
      endsAt: quiz.endsAt,
      attemptCompleted: completed.length,
      attemptInProgressId: inProgress?.id ?? null,
      bestGrades: completed.length ? Math.max(...completed.map((x) => x.grade)) : null,
      status,
      bisaMencoba: status === "open" && (Boolean(inProgress) || completed.length < quiz.maxAttempts),
    };
  });
}

/** "My Learning Progress": percentage of lessons completed and the latest quiz score. */
export async function studentProgress(studentId: string) {
  const material = await studentMaterials(studentId);
  const completed = material.filter((m) => m.completed).length;
  const [last] = await db
    .select({ grade: S.attempt.grade, title: S.quiz.title, time: S.attempt.completedAt })
    .from(S.attempt)
    .innerJoin(S.quiz, eq(S.quiz.id, S.attempt.quizId))
    .where(and(eq(S.attempt.studentId, studentId), eq(S.attempt.status, "completed")))
    .orderBy(desc(S.attempt.completedAt))
    .limit(1);
  return {
    materialTotal: material.length,
    materialCompleted: completed,
    percent: material.length ? round((completed / material.length) * 100) : 0,
    lastScore: last ?? null,
  };
}
