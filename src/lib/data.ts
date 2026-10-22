import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { round, today } from "./utils";

const S = schema;

const average = (a: number[]) => (a.length ? round(a.reduce((x, y) => x + y, 0) / a.length, 1) : null);

/* ------------------------------------------------------------------ */
/* Per-class statistics                                                */
/* ------------------------------------------------------------------ */

export type StudentStats = {
  id: string;
  name: string;
  email: string;
  /** Set only for an account the teacher created by hand (no working email). */
  username: string | null;
  joinedAt: Date;
  materialCompleted: number;
  quizCompleted: number;
  /** Average of the best grade of each quiz taken. null if none yet. */
  averageGrade: number | null;
  /** 0-100: percentage of published lessons that are completed. */
  progress: number;
  activeLast: Date | null;
};

export type ClassStats = {
  classroomId: string;
  member: StudentStats[];
  materialPublished: number;
  quizPublished: { id: string; title: string }[];
  averageGrade: number | null;
  averageProgress: number;
};

/** Best grade per (student, quiz) from finished attempts. */
export async function bestGrades(quizIds: string[], studentIds?: string[]) {
  if (!quizIds.length) return [];
  const rows = await db
    .select({ quizId: S.attempt.quizId, studentId: S.attempt.studentId, grade: S.attempt.grade, completedAt: S.attempt.completedAt })
    .from(S.attempt)
    .where(
      and(
        inArray(S.attempt.quizId, quizIds),
        eq(S.attempt.status, "completed"),
        studentIds ? (studentIds.length ? inArray(S.attempt.studentId, studentIds) : eq(S.attempt.id, "00000000-0000-0000-0000-000000000000")) : undefined,
      ),
    );
  const map = new Map<string, { quizId: string; studentId: string; grade: number; last: Date | null }>();
  for (const r of rows) {
    const k = `${r.studentId}|${r.quizId}`;
    const exists = map.get(k);
    if (!exists) map.set(k, { quizId: r.quizId, studentId: r.studentId, grade: r.grade, last: r.completedAt });
    else {
      exists.grade = Math.max(exists.grade, r.grade);
      if (r.completedAt && (!exists.last || r.completedAt > exists.last)) exists.last = r.completedAt;
    }
  }
  return [...map.values()];
}

export async function classStats(classroomId: string): Promise<ClassStats> {
  const member = await db
    .select({ id: S.user.id, name: S.user.name, email: S.user.email, username: S.user.username, joinedAt: S.classroomMembership.joinedAt })
    .from(S.classroomMembership)
    .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
    .where(eq(S.classroomMembership.classroomId, classroomId))
    .orderBy(S.user.name);
  const studentIds = member.map((a) => a.id);

  const published = await db
    .select({ id: S.classroomMaterial.materialId })
    .from(S.classroomMaterial)
    .where(and(eq(S.classroomMaterial.classroomId, classroomId), lte(S.classroomMaterial.date, today())));
  const materialIds = published.map((t) => t.id);

  const quizPublished = await db
    .select({ id: S.quiz.id, title: S.quiz.title })
    .from(S.quiz)
    .where(and(eq(S.quiz.classroomId, classroomId), eq(S.quiz.published, true)));
  const quizIds = quizPublished.map((k) => k.id);

  const progress =
    studentIds.length && materialIds.length
      ? await db
          .select({ studentId: S.materialProgress.studentId, completedAt: S.materialProgress.completedAt })
          .from(S.materialProgress)
          .where(and(inArray(S.materialProgress.studentId, studentIds), inArray(S.materialProgress.materialId, materialIds), eq(S.materialProgress.completed, true)))
      : [];
  const grade = await bestGrades(quizIds, studentIds);

  const statStudent: StudentStats[] = member.map((a) => {
    const p = progress.filter((x) => x.studentId === a.id);
    const n = grade.filter((x) => x.studentId === a.id);
    const time = [...p.map((x) => x.completedAt), ...n.map((x) => x.last)].filter((x): x is Date => Boolean(x));
    return {
      ...a,
      materialCompleted: p.length,
      quizCompleted: n.length,
      averageGrade: average(n.map((x) => x.grade)),
      progress: materialIds.length ? round((p.length / materialIds.length) * 100) : 0,
      activeLast: time.length ? new Date(Math.max(...time.map((d) => d.getTime()))) : null,
    };
  });

  return {
    classroomId,
    member: statStudent,
    materialPublished: materialIds.length,
    quizPublished,
    averageGrade: average(statStudent.map((s) => s.averageGrade).filter((n): n is number => n !== null)),
    averageProgress: statStudent.length ? round(statStudent.reduce((a, s) => a + s.progress, 0) / statStudent.length) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Teacher dashboard                                                   */
/* ------------------------------------------------------------------ */

export async function teacherSummary(teacherId: string) {
  const classroomList = await db.select().from(S.classroom).where(eq(S.classroom.teacherId, teacherId)).orderBy(S.classroom.name);
  const stat = await Promise.all(classroomList.map((k) => classStats(k.id)));
  const classroom = classroomList.map((k, i) => ({ ...k, stat: stat[i] }));

  const allStudent = new Set(stat.flatMap((s) => s.member.map((a) => a.id)));
  const studentGrade = stat.flatMap((s) => s.member.map((a) => a.averageGrade).filter((n): n is number => n !== null));
  const quizPublished = await db.select({ id: S.quiz.id }).from(S.quiz).where(and(eq(S.quiz.teacherId, teacherId), eq(S.quiz.published, true)));
  return { classroom, totalStudent: allStudent.size, averageGrade: average(studentGrade), activeQuiz: quizPublished.length };
}

export type Activity = { time: Date; student: string; studentId: string; key: string; args: (string | number)[]; kind: "quiz" | "material" | "recording" | "practice" };

export async function recentActivity(teacherId: string, limit = 12): Promise<Activity[]> {
  const member = await db
    .select({ id: S.classroomMembership.studentId })
    .from(S.classroomMembership)
    .innerJoin(S.classroom, eq(S.classroom.id, S.classroomMembership.classroomId))
    .where(eq(S.classroom.teacherId, teacherId));
  const ids = [...new Set(member.map((a) => a.id))];
  if (!ids.length) return [];

  const [quizRows, materialRows, recordingRows, practiceRows] = await Promise.all([
    db
      .select({ time: S.attempt.completedAt, student: S.user.name, studentId: S.user.id, title: S.quiz.title, grade: S.attempt.grade })
      .from(S.attempt)
      .innerJoin(S.user, eq(S.user.id, S.attempt.studentId))
      .innerJoin(S.quiz, eq(S.quiz.id, S.attempt.quizId))
      .where(and(inArray(S.attempt.studentId, ids), eq(S.quiz.teacherId, teacherId), eq(S.attempt.status, "completed")))
      .orderBy(desc(S.attempt.completedAt))
      .limit(limit),
    db
      .select({ time: S.materialProgress.completedAt, student: S.user.name, studentId: S.user.id, title: S.material.title })
      .from(S.materialProgress)
      .innerJoin(S.user, eq(S.user.id, S.materialProgress.studentId))
      .innerJoin(S.material, eq(S.material.id, S.materialProgress.materialId))
      .where(and(inArray(S.materialProgress.studentId, ids), eq(S.material.teacherId, teacherId), eq(S.materialProgress.completed, true)))
      .orderBy(desc(S.materialProgress.completedAt))
      .limit(limit),
    db
      .select({ time: S.recording.createdAt, student: S.user.name, studentId: S.user.id, title: S.recording.title })
      .from(S.recording)
      .innerJoin(S.user, eq(S.user.id, S.recording.studentId))
      .where(inArray(S.recording.studentId, ids))
      .orderBy(desc(S.recording.createdAt))
      .limit(limit),
    db
      .select({ time: S.practiceResult.createdAt, student: S.user.name, studentId: S.user.id, title: S.practiceResult.title, score: S.practiceResult.score })
      .from(S.practiceResult)
      .innerJoin(S.user, eq(S.user.id, S.practiceResult.studentId))
      .where(inArray(S.practiceResult.studentId, ids))
      .orderBy(desc(S.practiceResult.createdAt))
      .limit(limit),
  ]);

  const all: Activity[] = [
    ...quizRows.filter((r) => r.time).map((r) => ({ time: r.time!, student: r.student, studentId: r.studentId, kind: "quiz" as const, key: "completed “{0}” with a grade of {1}", args: [r.title, round(r.grade)] })),
    ...materialRows.filter((r) => r.time).map((r) => ({ time: r.time!, student: r.student, studentId: r.studentId, kind: "material" as const, key: "finished studying “{0}”", args: [r.title] })),
    ...recordingRows.map((r) => ({ time: r.time, student: r.student, studentId: r.studentId, kind: "recording" as const, key: "recorded “{0}”", args: [r.title] })),
    ...practiceRows.map((r) => ({ time: r.time, student: r.student, studentId: r.studentId, kind: "practice" as const, key: "practiced “{0}” (score {1})", args: [r.title, r.score] })),
  ];
  return all.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, limit);
}

export type QuizSummary = {
  id: string;
  title: string;
  classroomId: string;
  classroomName: string;
  published: boolean;
  questionCount: number;
  /** Distinct topics (TP from Perangkat Ajar, or free text) of the quiz's questions. */
  topics: string[];
  studentCount: number;
  hasTaken: number;
  averageGrade: number | null;
  createdAt: Date;
};

export async function teacherQuizList(teacherId: string, limit?: number): Promise<QuizSummary[]> {
  const q = db
    .select({ quiz: S.quiz, classroomName: S.classroom.name })
    .from(S.quiz)
    .innerJoin(S.classroom, eq(S.classroom.id, S.quiz.classroomId))
    .where(eq(S.quiz.teacherId, teacherId))
    .orderBy(desc(S.quiz.createdAt));
  const rows = limit ? await q.limit(limit) : await q;
  if (!rows.length) return [];
  const quizIds = rows.map((r) => r.quiz.id);
  const classroomIds = [...new Set(rows.map((r) => r.quiz.classroomId))];

  const [questionRows, member, grade] = await Promise.all([
    db
      .select({ quizId: S.quizQuestion.quizId, topic: S.question.topic })
      .from(S.quizQuestion)
      .innerJoin(S.question, eq(S.question.id, S.quizQuestion.questionId))
      .where(inArray(S.quizQuestion.quizId, quizIds)),
    db.select({ classroomId: S.classroomMembership.classroomId, studentId: S.classroomMembership.studentId }).from(S.classroomMembership).where(inArray(S.classroomMembership.classroomId, classroomIds)),
    bestGrades(quizIds),
  ]);
  return rows.map(({ quiz, classroomName }) => {
    const classroomStudents = new Set(member.filter((a) => a.classroomId === quiz.classroomId).map((a) => a.studentId));
    const n = grade.filter((x) => x.quizId === quiz.id && classroomStudents.has(x.studentId));
    const question = questionRows.filter((s) => s.quizId === quiz.id);
    return {
      id: quiz.id,
      title: quiz.title,
      classroomId: quiz.classroomId,
      classroomName,
      published: quiz.published,
      questionCount: question.length,
      topics: [...new Set(question.map((s) => s.topic).filter((x): x is string => Boolean(x)))].sort(),
      studentCount: classroomStudents.size,
      hasTaken: n.length,
      averageGrade: average(n.map((x) => x.grade)),
      createdAt: quiz.createdAt,
    };
  });
}

/** Students who have not taken a published quiz (per quiz). */
export async function studentsPendingQuiz(teacherId: string, quizLimit = 3) {
  const list = (await teacherQuizList(teacherId)).filter((k) => k.published).slice(0, quizLimit);
  const result: { quizId: string; title: string; classroomName: string; student: { id: string; name: string }[] }[] = [];
  for (const k of list) {
    const member = await db
      .select({ id: S.user.id, name: S.user.name })
      .from(S.classroomMembership)
      .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
      .where(eq(S.classroomMembership.classroomId, k.classroomId))
      .orderBy(S.user.name);
    const done = new Set((await bestGrades([k.id])).map((n) => n.studentId));
    result.push({ quizId: k.id, title: k.title, classroomName: k.classroomName, student: member.filter((a) => !done.has(a.id)) });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Class grade summary (F8)                                            */
/* ------------------------------------------------------------------ */

export type ClassGradeMatrix = {
  quiz: { id: string; title: string }[];
  student: { id: string; name: string; email: string; grade: Record<string, number | null>; average: number | null; completed: number }[];
  quizAverage: Record<string, number | null>;
  classAverage: number | null;
};

/** Best-grade matrix: students x published quizzes for one class. */
export async function classGradeMatrix(classroomId: string): Promise<ClassGradeMatrix> {
  const [member, quizRows] = await Promise.all([
    db
      .select({ id: S.user.id, name: S.user.name, email: S.user.email })
      .from(S.classroomMembership)
      .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
      .where(eq(S.classroomMembership.classroomId, classroomId))
      .orderBy(S.user.name),
    db
      .select({ id: S.quiz.id, title: S.quiz.title })
      .from(S.quiz)
      .where(and(eq(S.quiz.classroomId, classroomId), eq(S.quiz.published, true)))
      .orderBy(S.quiz.createdAt),
  ]);
  const grade = await bestGrades(
    quizRows.map((k) => k.id),
    member.map((a) => a.id),
  );
  const student = member.map((a) => {
    const n: Record<string, number | null> = {};
    for (const k of quizRows) n[k.id] = grade.find((x) => x.studentId === a.id && x.quizId === k.id)?.grade ?? null;
    const exists = Object.values(n).filter((v): v is number => v !== null);
    return { ...a, grade: n, average: average(exists), completed: exists.length };
  });
  const quizAverage: Record<string, number | null> = {};
  for (const k of quizRows) quizAverage[k.id] = average(student.map((s) => s.grade[k.id]).filter((v): v is number => v !== null));
  return { quiz: quizRows, student, quizAverage, classAverage: average(student.map((s) => s.average).filter((v): v is number => v !== null)) };
}
