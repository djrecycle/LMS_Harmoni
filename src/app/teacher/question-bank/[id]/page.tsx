import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { QuestionForm } from "@/components/question-form";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getOwnedQuestion } from "@/lib/access";
import { materialFormData } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit Question") };
}

/** Only allow going back to a page inside the teacher area (no open redirects). */
const safeBack = (v: string | undefined) => (v && /^\/teacher\/[\w\-/#]*$/.test(v) ? v : null);

export default async function EditQuestion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const back = safeBack((await searchParams).back);
  const question = await getOwnedQuestion(teacher.id, id);
  if (!question) notFound();
  const [{ topicSuggestions }, answered] = await Promise.all([
    materialFormData(teacher.id),
    db.select({ id: schema.answer.id }).from(schema.answer).where(eq(schema.answer.questionId, question.id)).limit(1),
  ]);
  return (
    <>
      {back && (
        <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {back.includes("/quizzes/") ? t("Back to quiz preview") : t("Back")}
        </Link>
      )}
      <PageHeader title={t("Edit question")} />
      {answered.length > 0 && (
        <Alert kind="warning" className="mb-4" title={t("Students have answered this question")}>
          {t("Changes to the answer key only apply to future answers. Grades that are already saved are not recalculated.")}
        </Alert>
      )}
      <Card>
        <CardContent className="pt-5">
          <QuestionForm question={question} topicSuggestions={topicSuggestions} target={back ?? undefined} />
        </CardContent>
      </Card>
    </>
  );
}
