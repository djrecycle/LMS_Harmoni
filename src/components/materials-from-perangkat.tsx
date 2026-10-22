"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Library, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { saveMaterialFromDoc } from "@/app/actions/perangkat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { PROVIDER_LABEL } from "@/lib/perangkat/view";
import { useT } from "@/i18n/client";

export type PerangkatMaterialRow = { id: string; kind: "materi_guru" | "materi_siswa"; title: string; provider: string | null; kelas: string; createdAt: string };

const KIND_LABEL = { materi_guru: "Teacher material", materi_siswa: "Student material" } as const;
const KIND_TONE = { materi_guru: "success", materi_siswa: "neutral" } as const;

/**
 * Teacher/student material already generated in Teaching Documents (Perangkat Ajar), shown here too so a
 * teacher does not have to remember to go to the other page to turn it into an assignable lesson.
 */
export function MaterialsFromPerangkat({ rows }: { rows: PerangkatMaterialRow[] }) {
  const t = useT();
  const router = useRouter();
  const [working, startWork] = useTransition();
  const [workingId, setWorkingId] = useState("");

  function add(id: string) {
    setWorkingId(id);
    startWork(async () => {
      const r = await saveMaterialFromDoc(id);
      if (!r.ok) return void toast.error(r.error ?? t("Could not add to Lessons."));
      toast.success(r.message ?? t("Added to Lessons."));
      router.refresh();
    });
  }

  return (
    <section className="mb-6 grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div>
        <h2 className="text-lg font-bold">{t("From Teaching Documents")}</h2>
        <p className="text-sm text-muted-foreground">{t("Teacher and student material already generated in Teaching Documents. Add one here to assign it to a class as a lesson.")}</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          {t("Nothing here yet.")}{" "}
          <Link href="/teacher/perangkat-ajar" className="font-semibold text-primary hover:underline">
            {t("Create teacher or student material in Teaching Documents")}
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2.5 rounded-lg border p-3">
              <Badge tone={KIND_TONE[r.kind]}>{t(KIND_LABEL[r.kind])}</Badge>
              {r.kelas && <Badge tone="primary">{t("Class {0}", r.kelas)}</Badge>}
              <span className="min-w-0 flex-[1_1_12rem] break-words font-semibold">{r.title}</span>
              {r.provider && <Badge>{PROVIDER_LABEL[r.provider] ?? r.provider}</Badge>}
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/perangkat/${r.id}/download`}>
                  <Download /> {t("Download .docx")}
                </a>
              </Button>
              <Button size="sm" disabled={working} onClick={() => add(r.id)}>
                {working && workingId === r.id ? <LoaderCircle className="animate-spin" /> : <Library />} {t("Add to Lessons")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Link href="/teacher/perangkat-ajar" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Sparkles className="size-4" /> {t("Go to Teaching Documents")}
      </Link>
    </section>
  );
}
