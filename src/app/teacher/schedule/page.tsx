import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ScheduleImportForm } from "@/components/schedule-import-form";
import { ScheduleManager } from "@/components/schedule-manager";
import { PageHeader } from "@/components/ui/misc";
import { providerOptions } from "@/lib/ai";
import { listSchedule } from "@/lib/schedule-data";
import { nowWib } from "@/lib/days";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Teaching Schedule") };
}

export default async function SchedulePage() {
  const t = await getT();
  const teacher = await requireTeacher();
  const [classrooms, rows] = await Promise.all([
    db.select({ id: schema.classroom.id, name: schema.classroom.name }).from(schema.classroom).where(eq(schema.classroom.teacherId, teacher.id)).orderBy(schema.classroom.name),
    listSchedule(teacher.id),
  ]);

  return (
    <>
      <PageHeader title={t("Teaching Schedule")} description={t("Your weekly timetable: which class, subject, and time.")} />
      <div className="grid gap-5">
        <ScheduleImportForm providers={await providerOptions()} />
        <ScheduleManager classrooms={classrooms} rows={rows} initialNow={nowWib()} />
      </div>
    </>
  );
}
