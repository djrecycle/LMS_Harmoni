import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { JournalForm } from "@/components/journal-form";
import { PageHeader } from "@/components/ui/misc";
import { getOwnedClassSession } from "@/lib/access";
import { classRoster, listModulAjarOptions, sessionAttendance } from "@/lib/journal-data";
import { requireTeacher } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit Journal Entry") };
}

export default async function EditJournalPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const session = await getOwnedClassSession(teacher.id, id);
  if (!session) notFound();

  const [classroom, roster, attendance, modulAjarOptions] = await Promise.all([
    db.select({ name: schema.classroom.name }).from(schema.classroom).where(eq(schema.classroom.id, session.classroomId)).limit(1).then((r) => r[0]),
    classRoster(session.classroomId),
    sessionAttendance(session.id),
    listModulAjarOptions(teacher.id),
  ]);

  return (
    <>
      <Link href="/teacher/journal" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="size-4" /> {t("Teaching Journal")}
      </Link>
      <PageHeader title={classroom?.name ?? t("Edit Journal Entry")} description={t("Entry of {0}", formatDate(session.tanggal))} />
      <JournalForm
        sessionId={session.id}
        classroomId={session.classroomId}
        classroomName={classroom?.name ?? ""}
        initialTanggal={session.tanggal}
        roster={roster}
        initialAttendance={attendance}
        initial={{ waktu: session.waktu ?? "", materi: session.materi ?? "", kegiatan: session.kegiatan ?? "", kendala: session.kendala ?? "", catatan: session.catatan ?? "" }}
        modulAjarOptions={modulAjarOptions}
      />
    </>
  );
}
