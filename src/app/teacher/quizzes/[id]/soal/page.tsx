import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PracticeEditor, type PracticeGroup } from "@/components/practice-editor";
import { db, schema } from "@/db";
import { getOwnedQuiz } from "@/lib/access";
import { imageReadyFor, providerOptions } from "@/lib/ai";
import { EXAM_SECTIONS, SECTION_META, sectionForType } from "@/lib/exam";
import { getOwnedExam } from "@/lib/exam-store";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Manage practice questions") };
}

const S = schema;
const EXAM_TYPES = EXAM_SECTIONS.map((s) => SECTION_META[s].type);

/** Question by question editing of a practice quiz (Latihan Ujian), with the same tools as an exam's questions. */
export default async function PracticeQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const quiz = await getOwnedQuiz(teacher.id, id);
  if (!quiz || !quiz.practice || !quiz.examId) notFound();
  const exam = await getOwnedExam(teacher.id, quiz.examId);
  if (!exam) notFound();

  const rows = await db
    .select({ question: S.question, item: S.examItem })
    .from(S.quizQuestion)
    .innerJoin(S.question, eq(S.question.id, S.quizQuestion.questionId))
    .leftJoin(S.examItem, eq(S.examItem.id, S.quizQuestion.examItemId))
    .where(eq(S.quizQuestion.quizId, quiz.id))
    .orderBy(asc(S.quizQuestion.position));
  const questionIds = rows.map((r) => r.question.id);

  const [bank, classes, providers, imageAi] = await Promise.all([
    db
      .select({ id: S.question.id, type: S.question.type, prompt: S.question.prompt, topic: S.question.topic, kelas: S.question.kelas, level: S.question.level })
      .from(S.question)
      .where(and(eq(S.question.teacherId, teacher.id), inArray(S.question.type, EXAM_TYPES)))
      .orderBy(desc(S.question.createdAt)),
    // Other classes that got this practice share its questions, so a change reaches them too.
    questionIds.length
      ? db
          .selectDistinct({ name: S.classroom.name })
          .from(S.quiz)
          .innerJoin(S.classroom, eq(S.classroom.id, S.quiz.classroomId))
          .innerJoin(S.quizQuestion, eq(S.quizQuestion.quizId, S.quiz.id))
          .where(and(eq(S.quiz.examId, exam.id), eq(S.quiz.practice, true), inArray(S.quizQuestion.questionId, questionIds)))
          .orderBy(asc(S.classroom.name))
      : Promise.resolve([] as { name: string }[]),
    providerOptions(teacher.id),
    imageReadyFor(teacher.id),
  ]);

  let no = 0;
  const groups: PracticeGroup[] = EXAM_SECTIONS.map((section) => ({
    section,
    items: rows
      .filter((r) => sectionForType(r.question.type) === section)
      .map(({ question: q, item }) => ({
        id: q.id,
        no: ++no,
        section,
        tp: item?.tp ?? q.topic ?? "",
        materi: item?.materi ?? "",
        indikator: item?.indikator ?? "",
        level: item?.level ?? q.level ?? "",
        kisiChanged: false,
        question: {
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          options: q.options,
          optionImages: q.optionImages,
          matchRows: q.matchRows,
          answerKey: q.answerKey,
          explanation: q.explanation,
          mediaKey: q.mediaKey,
          notation: q.notation,
          imageHint: q.imageHint,
        },
      })),
  }));
  const other = rows.length - no;

  return (
    <>
      <Link href={`/teacher/quizzes/${quiz.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {quiz.title}
      </Link>
      <PracticeEditor
        quiz={{ id: quiz.id, title: quiz.title }}
        exam={{ id: exam.id, title: exam.title }}
        classes={classes.map((c) => c.name)}
        groups={groups}
        other={other}
        bank={bank.filter((b) => !questionIds.includes(b.id))}
        providers={providers}
        imageAi={imageAi}
      />
    </>
  );
}
