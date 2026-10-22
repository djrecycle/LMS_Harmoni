import type { Metadata } from "next";
import Link from "next/link";
import { Library } from "lucide-react";
import { StudentMaterialCard } from "@/components/student-material-card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { studentMaterials } from "@/lib/student-data";
import { requireStudent } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Lessons") };
}

export default async function StudentMaterialList({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const t = await getT();
  const student = await requireStudent();
  const { show } = await searchParams;
  const all = await studentMaterials(student.id);
  const pending = show === "pending";
  const list = pending ? all.filter((m) => !m.completed) : all;

  return (
    <>
      <PageHeader title={t("Lessons")} description={t("All the lessons your teacher has opened.")} />
      <div className="mb-4 inline-flex rounded-lg bg-muted p-1 text-sm font-semibold">
        {[
          ["", t("All")],
          ["pending", t("Not completed")],
        ].map(([grade, label]) => (
          <Link key={grade} href={grade ? `?show=${grade}` : "?"} className={cn("rounded-md px-4 py-1.5", (pending ? "pending" : "") === grade && "bg-card shadow-xs")}>
            {label}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Library />} title={pending ? t("All lessons completed") : t("No lessons yet")}>
          {pending ? t("Great! You have finished every available lesson.") : t("Lessons will appear here after your teacher publishes them. Make sure you have joined a class.")}
        </EmptyState>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {list.map((m) => (
            <StudentMaterialCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </>
  );
}
