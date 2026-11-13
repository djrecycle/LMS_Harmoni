import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { QuizRunner } from "@/components/quiz-runner";
import { EmptyState } from "@/components/ui/misc";
import { toStudentQuestion } from "@/lib/questions";
import { previewQuestions, type PreviewSource } from "@/lib/student-preview";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

/** "Try as a student" for a quiz or an exam of this teacher: the student's quiz screen, with nothing saved. */
export async function StudentPreviewPage({ source, backHref }: { source: PreviewSource; backHref: string }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const data = await previewQuestions(teacher.id, source);
  if (!data) notFound();
  // Exactly what a student receives: no answer key, and the points this quiz gives each question.
  const question = data.rows.map((r) => toStudentQuestion({ ...r.question, points: r.points }));
  return (
    <>
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Back")}
      </Link>
      {question.length === 0 ? (
        <EmptyState title={t("No questions yet")}>{t("Add questions first, then try them as a student.")}</EmptyState>
      ) : (
        <QuizRunner
          quizId={source.id}
          attemptId=""
          title={data.title}
          instant={data.instant}
          question={question}
          initialState={{}}
          remainingSeconds={data.durationMinutes ? data.durationMinutes * 60 : null}
          preview={{ ...source, backHref }}
        />
      )}
    </>
  );
}
