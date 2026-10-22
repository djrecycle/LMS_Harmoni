"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { useT } from "@/i18n/client";

/** Download every journal entry for one class, in order, as a printable PDF or .xlsx file. */
export function JournalExportForm({ classrooms }: { classrooms: { id: string; name: string }[] }) {
  const t = useT();
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  if (classrooms.length === 0) return null;

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Printer className="size-5" /> {t("Print journal per class")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("Download every entry for one class, oldest first, as a printable file.")}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label={t("Class")} htmlFor="je-class">
          <Select id="je-class" value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button asChild variant="outline">
          <a href={`/api/journal/${classroomId}/download?format=pdf`}>
            <FileText /> {t("Download PDF")}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/journal/${classroomId}/download?format=xlsx`}>
            <FileSpreadsheet /> {t("Download Excel")}
          </a>
        </Button>
      </div>
    </section>
  );
}
