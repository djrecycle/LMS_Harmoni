import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { ExamWorkspace, type WorkspaceItem } from "@/components/exam-workspace";
import { db, schema } from "@/db";
import { imageReadyFor, providerOptions } from "@/lib/ai";
import { EXAM_SECTIONS, SECTION_META, readComposition } from "@/lib/exam";
import { expireStaleExamJob, getOwnedExam, listExamItems } from "@/lib/exam-store";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Exam") };
}

const S = schema;
const EXAM_TYPES = EXAM_SECTIONS.map((s) => SECTION_META[s].type);

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const found = await getOwnedExam(teacher.id, id);
  if (!found) notFound();
  await expireStaleExamJob(found.id);
  const exam = (await getOwnedExam(teacher.id, id))!;

  const [rows, bank, quizzes, classrooms, linked, providers, imageAi] = await Promise.all([
    listExamItems(exam.id),
    db
      .select({ id: S.question.id, type: S.question.type, prompt: S.question.prompt, topic: S.question.topic, kelas: S.question.kelas, level: S.question.level })
      .from(S.question)
      .where(and(eq(S.question.teacherId, teacher.id), inArray(S.question.type, EXAM_TYPES)))
      .orderBy(desc(S.question.createdAt)),
    db
      .select({ id: S.quiz.id, title: S.quiz.title, classroomName: S.classroom.name, n: count(S.quizQuestion.id) })
      .from(S.quiz)
      .innerJoin(S.classroom, eq(S.classroom.id, S.quiz.classroomId))
      .leftJoin(S.quizQuestion, eq(S.quizQuestion.quizId, S.quiz.id))
      .where(eq(S.quiz.teacherId, teacher.id))
      .groupBy(S.quiz.id, S.classroom.name)
      .orderBy(desc(S.quiz.createdAt)),
    db.select({ id: S.classroom.id, name: S.classroom.name }).from(S.classroom).where(eq(S.classroom.teacherId, teacher.id)).orderBy(asc(S.classroom.name)),
    db
      .select({ id: S.quiz.id, title: S.quiz.title, published: S.quiz.published, classroomName: S.classroom.name, attempts: count(S.attempt.id) })
      .from(S.quiz)
      .innerJoin(S.classroom, eq(S.classroom.id, S.quiz.classroomId))
      .leftJoin(S.attempt, eq(S.attempt.quizId, S.quiz.id))
      .where(and(eq(S.quiz.examId, exam.id), eq(S.quiz.teacherId, teacher.id)))
      .groupBy(S.quiz.id, S.classroom.name)
      .orderBy(desc(S.quiz.createdAt)),
    providerOptions(teacher.id),
    imageReadyFor(teacher.id),
  ]);

  const items: WorkspaceItem[] = rows.map(({ item, question }) => ({
    id: item.id,
    section: item.section,
    tp: item.tp,
    materi: item.materi,
    indikator: item.indikator,
    level: item.level,
    question: question
      ? {
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          options: question.options,
          optionImages: question.optionImages,
          matchRows: question.matchRows,
          answerKey: question.answerKey,
          explanation: question.explanation,
          mediaKey: question.mediaKey,
          notation: question.notation,
          imageHint: question.imageHint,
        }
      : null,
  }));

  return (
    <>
      <Link href="/teacher/exams" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Exams")}
      </Link>
      <ExamWorkspace
        exam={{ id: exam.id, title: exam.title, info: exam.info, tps: exam.tps, composition: readComposition(exam.composition), job: exam.job, jobError: exam.jobError }}
        items={items}
        bank={bank}
        quizzes={quizzes.map((q) => ({ ...q, n: Number(q.n) }))}
        classrooms={classrooms}
        linked={linked.map((q) => ({ ...q, attempts: Number(q.attempts) }))}
        providers={providers}
        imageAi={imageAi}
      />
    </>
  );
}
