import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { BackPractice } from "@/components/back-practice";
import { Recorder } from "@/components/recorder";
import { PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Record & Play Back") };
}

export default async function RecordingPage() {
  const t = await getT();
  const student = await requireStudent();
  const list = await db.select().from(schema.recording).where(eq(schema.recording.studentId, student.id)).orderBy(desc(schema.recording.createdAt));
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Record & Play Back")} description={t("Record your playing, listen again, and save it so your teacher can hear it.")} />
      <Recorder list={list.map((r) => ({ id: r.id, title: r.title, fileKey: r.fileKey, durationSeconds: r.durationSeconds, createdAt: r.createdAt }))} />
    </>
  );
}
