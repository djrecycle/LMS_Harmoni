import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClassPracticeRecap } from "@/components/class-practice-recap";
import { PageHeader } from "@/components/ui/misc";
import { getOwnedClassroom } from "@/lib/access";
import { loadClassPracticeRecap, RECAP_RANGES, type RecapRange } from "@/lib/class-practice-recap";
import { requireTeacher } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Practice recap") };
}

export default async function ClassPracticeRecapPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const classroom = await getOwnedClassroom(teacher.id, id);
  if (!classroom) notFound();
  const { range: rangeParam } = await searchParams;
  const range: RecapRange = rangeParam && rangeParam in RECAP_RANGES ? (rangeParam as RecapRange) : "30";
  const { rows, kinds } = await loadClassPracticeRecap(classroom.id, range);

  const labels: Record<RecapRange, string> = { "7": t("Last 7 days"), "30": t("Last 30 days"), "90": t("Last 90 days"), all: t("All time") };

  return (
    <>
      <Link href={`/teacher/classes/${classroom.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {classroom.name}
      </Link>
      <PageHeader title={t("Practice recap")} description={t("{0} — practice scores of every student: exercises and piano songs.", classroom.name)} />
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(RECAP_RANGES) as RecapRange[]).map((r) => (
          <Link
            key={r}
            href={`?range=${r}`}
            aria-current={range === r ? "page" : undefined}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", range === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {labels[r]}
          </Link>
        ))}
      </div>
      <ClassPracticeRecap classroomId={classroom.id} className={classroom.name} rangeLabel={labels[range]} rows={rows} kinds={kinds} />
    </>
  );
}
