"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import type { ClassPracticeRow } from "@/lib/class-practice-recap";
import { downloadCsv, fileSafe } from "@/lib/csv-download";
import { PRACTICE_KIND_LABEL, type PracticeKind } from "@/lib/practice";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";

const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 55 ? "text-foreground" : "text-danger");

/** Teacher's practice recap of one class: a row per student, a column per practice kind, songs opened per student. */
export function ClassPracticeRecap({ classroomId, className, rangeLabel, rows, kinds }: { classroomId: string; className: string; rangeLabel: string; rows: ClassPracticeRow[]; kinds: PracticeKind[] }) {
  const t = useT();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const practised = rows.filter((r) => r.attempts > 0);

  function exportCsv() {
    const header = [t("Student"), t("attempts"), ...kinds.flatMap((k) => [`${t(PRACTICE_KIND_LABEL[k])} – ${t("attempts")}`, `${t(PRACTICE_KIND_LABEL[k])} – ${t("best")}`, `${t(PRACTICE_KIND_LABEL[k])} – ${t("last")}`]), t("Songs")];
    const body = rows.map((r) => [
      r.name,
      String(r.attempts),
      ...kinds.flatMap((k) => {
        const s = r.kinds[k];
        return s ? [String(s.attempts), String(s.best), String(s.last)] : ["", "", ""];
      }),
      r.songs.map((s) => `${s.title} (${t("best")} ${s.best}, ${t("{0}×", s.attempts)})`).join("; "),
    ]);
    downloadCsv(`${fileSafe(`Rekap_latihan_${className}_${rangeLabel}`)}.csv`, [header, ...body]);
  }

  if (rows.length === 0) return <EmptyState title={t("There are no students in this class yet")} />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm shadow-xs">
        <p>
          {t("{0} of {1} students have practised.", practised.length, rows.length)}{" "}
          <span className="text-muted-foreground">{t("Includes the Practice menu, Piano Virtual songs (Perform mode), lessons and practice materials.")}</span>
        </p>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download /> {t("Download CSV")}
        </Button>
      </div>

      {kinds.length === 0 ? (
        <EmptyState title={t("No practice scores in this period")}>{t("Scores appear here once students finish an exercise or play a song in Perform mode.")}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs [contain:inline-size]">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted px-3 py-2">{t("Student")}</th>
                {kinds.map((k) => (
                  <th key={k} className="px-3 py-2 whitespace-nowrap">
                    {t(PRACTICE_KIND_LABEL[k])}
                  </th>
                ))}
                <th className="px-3 py-2 whitespace-nowrap">{t("Last practised")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open.has(r.studentId);
                return (
                  <Fragment key={r.studentId}>
                    <tr className="border-t align-top">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2">
                        <Link href={`/teacher/classes/${classroomId}/students/${r.studentId}`} className="font-semibold break-words hover:text-primary hover:underline">
                          {r.name}
                        </Link>
                        {r.songs.length > 0 && (
                          <button type="button" onClick={() => toggle(r.studentId)} aria-expanded={isOpen} className="mt-0.5 flex items-center gap-0.5 text-xs font-semibold text-primary">
                            {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} {t("{0} songs", r.songs.length)}
                          </button>
                        )}
                      </td>
                      {kinds.map((k) => {
                        const s = r.kinds[k];
                        return (
                          <td key={k} className="px-3 py-2 whitespace-nowrap">
                            {s ? (
                              <>
                                <b className={scoreTone(s.best)}>{s.best}</b>
                                <span className="text-muted-foreground"> / </span>
                                <span className={scoreTone(s.last)}>{s.last}</span>
                                <span className="block text-xs text-muted-foreground">{t("{0}×", s.attempts)}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.lastAt ? formatDate(r.lastAt) : t("Not practised yet")}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/30">
                        <td colSpan={kinds.length + 2} className="px-3 py-2">
                          <ul className="grid gap-1">
                            {r.songs.map((s) => (
                              <li key={s.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <span className="min-w-0 break-words">
                                  {s.title}
                                  <span className="text-xs text-muted-foreground">
                                    {" "}
                                    · {t("{0}×", s.attempts)} · {formatDate(s.lastAt)}
                                  </span>
                                </span>
                                <span className="tabular-nums">
                                  {t("best")} <b className={scoreTone(s.best)}>{s.best}</b> · {t("last")} <b className={cn(scoreTone(s.last))}>{s.last}</b>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t("Each cell: best score / last score, and the number of attempts.")}</p>
        </div>
      )}
    </div>
  );
}
