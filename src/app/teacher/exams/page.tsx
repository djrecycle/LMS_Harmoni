import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileCheck2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { readComposition, totalCount } from "@/lib/exam";
import { requireTeacher } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Exams") };
}

const S = schema;

export default async function ExamList() {
  const t = await getT();
  const teacher = await requireTeacher();
  const [exams, items] = await Promise.all([
    db.select().from(S.exam).where(eq(S.exam.teacherId, teacher.id)).orderBy(desc(S.exam.updatedAt)),
    db
      .select({ examId: S.examItem.examId, questionId: S.examItem.questionId })
      .from(S.examItem)
      .innerJoin(S.exam, eq(S.exam.id, S.examItem.examId))
      .where(eq(S.exam.teacherId, teacher.id)),
  ]);
  const newButton = (
    <Button asChild>
      <Link href="/teacher/exams/new">
        <Plus /> {t("New exam")}
      </Link>
    </Button>
  );
  return (
    <>
      <PageHeader title={t("Exams")} description={t("Choose the CP/TP, let the AI draft the blueprint (kisi-kisi) and questions, then download the CBT file or run the exam online.")} action={newButton} />
      {exams.length === 0 ? (
        <EmptyState icon={<FileCheck2 />} title={t("No exams yet")} action={newButton}>
          {t("An exam takes questions from your quizzes or has the AI write new ones from a blueprint.")}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {exams.map((e) => {
            const rows = items.filter((i) => i.examId === e.id);
            const filled = rows.filter((i) => i.questionId).length;
            const planned = totalCount(readComposition(e.composition));
            return (
              <div key={e.id} className="relative rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/teacher/exams/${e.id}`} className="font-bold break-words after:absolute after:inset-0 after:rounded-xl">
                    {e.title}
                  </Link>
                  {e.job && <Badge tone="primary">{t("AI working…")}</Badge>}
                  <Badge tone={rows.length > 0 && filled === rows.length ? "success" : "warning"}>{t("{0}/{1} questions", filled, rows.length || planned)}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[e.info.jenis_ujian, e.info.mata_pelajaran, e.info.kelas && t("Class {0}", e.info.kelas), e.info.semester].filter(Boolean).join(" · ")}
                  {" · "}
                  {t("updated {0}", formatDate(e.updatedAt))}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
