import type { Metadata } from "next";
import { QuestionForm } from "@/components/question-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { materialFormData } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New Question") };
}

export default async function NewQuestion() {
  const t = await getT();
  const teacher = await requireTeacher();
  const { topicSuggestions } = await materialFormData(teacher.id);
  return (
    <>
      <PageHeader title={t("New question")} description={t("Choose a question type, write the prompt, then set the answer key.")} />
      <Card>
        <CardContent className="pt-5">
          <QuestionForm topicSuggestions={topicSuggestions} target="/teacher/question-bank?view=recent" />
        </CardContent>
      </Card>
    </>
  );
}
