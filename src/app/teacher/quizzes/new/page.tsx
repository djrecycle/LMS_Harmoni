import type { Metadata } from "next";
import { QuizForm } from "@/components/quiz-form";
import { PageHeader } from "@/components/ui/misc";
import { quizFormData } from "@/lib/quiz-form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New Quiz") };
}

export default async function NewQuiz({ searchParams }: { searchParams: Promise<{ classroom?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { classroom: initialClassroom } = await searchParams;
  const data = await quizFormData(teacher.id);
  return (
    <>
      <PageHeader title={t("New quiz")} description={t("Choose a class, set the schedule, then build the quiz from the question bank.")} />
      <QuizForm {...data} initialClassroom={initialClassroom} />
    </>
  );
}
