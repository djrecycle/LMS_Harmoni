import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { NotebookPen, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { JournalExportForm } from "@/components/journal-export-form";
import { JournalGenerateForm } from "@/components/journal-generate-form";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { listJournal, unlinkedScheduleCount } from "@/lib/journal-data";
import { requireTeacher } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Teaching Journal") };
}

export default async function JournalListPage() {
  const t = await getT();
  const teacher = await requireTeacher();
  const [entries, classrooms, unlinked] = await Promise.all([
    listJournal(teacher.id),
    db.select({ id: schema.classroom.id, name: schema.classroom.name }).from(schema.classroom).where(eq(schema.classroom.teacherId, teacher.id)).orderBy(schema.classroom.name),
    unlinkedScheduleCount(teacher.id),
  ]);

  return (
    <>
      <PageHeader
        title={t("Teaching Journal")}
        description={t("One entry per class meeting: what you taught and who was there.")}
        action={
          <Button asChild>
            <Link href="/teacher/journal/new">
              <Plus /> {t("New entry")}
            </Link>
          </Button>
        }
      />
      {classrooms.length > 0 && (
        <div className="mb-6 grid gap-4">
          <JournalGenerateForm classrooms={classrooms} unlinkedScheduleCount={unlinked} />
          <JournalExportForm classrooms={classrooms} />
        </div>
      )}
      {entries.length === 0 ? (
        <EmptyState icon={<NotebookPen />} title={t("No entries yet")}>
          {t("Create your first entry after a class meeting: the material taught and who attended.")}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5">
          {entries.map((e) => (
            <Link key={e.id} href={`/teacher/journal/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-xs transition hover:border-primary hover:shadow-md">
              <div className="min-w-0">
                <p className="font-semibold">
                  {e.classroomName} <span className="font-normal text-muted-foreground">· {formatDate(e.tanggal)}</span>
                </p>
                <p className="break-words text-sm text-muted-foreground">{e.materi || t("(No material noted)")}</p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {t("Present:")} {e.hadir}/{e.total}
              </span>
            </Link>
          ))}
        </ul>
      )}
    </>
  );
}
