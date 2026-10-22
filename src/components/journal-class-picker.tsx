"use client";

import { useRouter } from "next/navigation";
import { Field, Select } from "@/components/ui/input";
import { useT } from "@/i18n/client";

/** Changing the class reloads the page with that class's roster (attendance depends on who is enrolled). */
export function JournalClassPicker({ classrooms, value, tanggal }: { classrooms: { id: string; name: string }[]; value: string; tanggal: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <Field label={t("Class")} htmlFor="journal-class">
      <Select id="journal-class" value={value} onChange={(e) => router.push(`/teacher/journal/new?classroomId=${e.target.value}&tanggal=${tanggal}`)}>
        {classrooms.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
