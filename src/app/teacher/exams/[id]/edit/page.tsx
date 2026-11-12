import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ExamSetupForm } from "@/components/exam-setup-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { readComposition } from "@/lib/exam";
import { getOwnedExam } from "@/lib/exam-store";
import { buildCpGroups } from "@/lib/perangkat/cp-groups";
import { listCpDocs } from "@/lib/perangkat/store";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Exam settings") };
}

export default async function EditExam({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const exam = await getOwnedExam(teacher.id, id);
  if (!exam) notFound();
  const cps = await listCpDocs(teacher.id);
  return (
    <>
      <Link href={`/teacher/exams/${exam.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {exam.title}
      </Link>
      <PageHeader title={t("Exam settings")} description={t("Changing the TP or the number of questions does not change the blueprint already made. Make it again with the AI, or add/delete rows yourself.")} />
      <Card>
        <CardContent className="pt-5">
          <ExamSetupForm initial={{ id: exam.id, title: exam.title, info: exam.info, tps: exam.tps, composition: readComposition(exam.composition) }} cpGroups={buildCpGroups(cps)} />
        </CardContent>
      </Card>
    </>
  );
}
