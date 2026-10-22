import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { JournalClassPicker } from "@/components/journal-class-picker";
import { JournalForm } from "@/components/journal-form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { classRoster, findSessionByDate, listModulAjarOptions } from "@/lib/journal-data";
import { requireTeacher } from "@/lib/session";
import { today } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New Journal Entry") };
}

export default async function NewJournalPage({ searchParams }: { searchParams: Promise<{ classroomId?: string; tanggal?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { classroomId, tanggal } = await searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(tanggal ?? "") ? tanggal! : today();

  const classrooms = await db.select({ id: schema.classroom.id, name: schema.classroom.name }).from(schema.classroom).where(eq(schema.classroom.teacherId, teacher.id)).orderBy(schema.classroom.name);

  const back = (
    <Link href="/teacher/journal" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
      <ArrowLeft className="size-4" /> {t("Teaching Journal")}
    </Link>
  );

  if (classrooms.length === 0) {
    return (
      <>
        {back}
        <PageHeader title={t("New Journal Entry")} />
        <EmptyState title={t("No classes yet")}>{t("Create a class first, under Classes & Students.")}</EmptyState>
      </>
    );
  }

  const selected = classrooms.find((c) => c.id === classroomId) ?? classrooms[0];

  // Already an entry for this class on this date: go straight to editing it instead of creating a duplicate.
  const existing = await findSessionByDate(teacher.id, selected.id, day);
  if (existing) redirect(`/teacher/journal/${existing.id}`);

  const [roster, modulAjarOptions] = await Promise.all([classRoster(selected.id), listModulAjarOptions(teacher.id)]);

  return (
    <>
      {back}
      <PageHeader title={t("New Journal Entry")} description={t("Choose the class and date, note what was taught, and mark attendance.")} />
      <div className="mb-5 max-w-xs">
        <JournalClassPicker classrooms={classrooms} value={selected.id} tanggal={day} />
      </div>
      <JournalForm
        classroomId={selected.id}
        classroomName={selected.name}
        initialTanggal={day}
        roster={roster}
        initialAttendance={{}}
        initial={{ waktu: "", materi: "", kegiatan: "", kendala: "", catatan: "" }}
        modulAjarOptions={modulAjarOptions}
      />
    </>
  );
}
