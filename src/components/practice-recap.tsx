"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { generatePracticeAnalysis } from "@/app/actions/practice-analysis";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { downloadCsv, fileSafe } from "@/lib/csv-download";
import { PRACTICE_KIND_LABEL, type PracticeKind } from "@/lib/practice";
import type { PracticeRecapRow } from "@/lib/practice-recap";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";

const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 55 ? "text-foreground" : "text-danger");

/** Teacher's practice recap of one lesson: scores per student and a written analysis made on request (rule-based or AI, for one or all). */
export function PracticeRecap({ materialId, materialTitle, classes, rows }: { materialId: string; materialTitle: string; classes: { id: string; name: string }[]; rows: PracticeRecapRow[] }) {
  const t = useT();
  const router = useRouter();
  const [classId, setClassId] = useState<string>("all");
  const [busy, start] = useTransition();
  const [working, setWorking] = useState<string | null>(null); // "all:rule", "<studentId>:ai", …

  const shown = classId === "all" ? rows : rows.filter((r) => r.classIds.includes(classId));
  const practised = shown.filter((r) => r.attempts > 0);
  const kinds = (Object.keys(PRACTICE_KIND_LABEL) as PracticeKind[]).filter((k) => rows.some((r) => r.kinds.some((x) => x.kind === k)));

  function analyse(source: "rule" | "ai", studentIds: string[], key: string) {
    setWorking(key);
    start(async () => {
      const r = await generatePracticeAnalysis({ materialId, studentIds, source });
      setWorking(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  }

  function exportCsv() {
    const header = [t("Student"), t("Class"), ...kinds.flatMap((k) => [`${t(PRACTICE_KIND_LABEL[k])} – ${t("attempts")}`, `${t(PRACTICE_KIND_LABEL[k])} – ${t("best")}`, `${t(PRACTICE_KIND_LABEL[k])} – ${t("last")}`]), t("Analysis")];
    const body = shown.map((r) => [
      r.name,
      r.classNames.join(", "),
      ...kinds.flatMap((k) => {
        const s = r.kinds.find((x) => x.kind === k);
        return s ? [String(s.attempts), String(s.best), String(s.last)] : ["", "", ""];
      }),
      r.analysis?.text ?? (r.attempts ? "" : t("Not practised yet")),
    ]);
    const cls = classes.find((c) => c.id === classId)?.name;
    downloadCsv(`${fileSafe(`Rekap_praktik_${materialTitle}${cls ? `_${cls}` : ""}`)}.csv`, [header, ...body]);
  }

  if (classes.length === 0) return <EmptyState title={t("This lesson is not assigned to any class yet")}>{t("Assign it to a class on the edit-lesson page; practice scores appear here once students practise.")}</EmptyState>;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        {[{ id: "all", name: t("All classes") }, ...classes].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setClassId(c.id)}
            aria-pressed={classId === c.id}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", classId === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <p className="text-sm">
          {t("{0} of {1} students have practised in this lesson.", practised.length, shown.length)}{" "}
          <span className="text-muted-foreground">{t("Analysis sentences are written only when you ask for them.")}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {t("Also counted: practice the student did in the Practice menu (or saved without a lesson) since the lesson was published in their class.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => analyse("rule", practised.map((r) => r.studentId), "all:rule")} disabled={busy || !practised.length}>
            <Wand2 /> {working === "all:rule" ? t("Writing…") : t("Automatic analysis for all")}
          </Button>
          <Button variant="secondary" onClick={() => analyse("ai", practised.map((r) => r.studentId), "all:ai")} disabled={busy || !practised.length}>
            <Sparkles /> {working === "all:ai" ? t("AI is writing…") : t("AI analysis for all")}
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!shown.length}>
            <Download /> {t("Download CSV")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("Automatic: instant and free, from the scores and timing data. AI: smoother sentences, uses one AI allowance per 25 students; student names are not sent.")}</p>
      </div>

      {shown.length === 0 ? (
        <EmptyState title={t("There are no students in this class yet")} />
      ) : (
        <div className="grid gap-3">
          {shown.map((r) => (
            <div key={r.studentId} className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold break-words">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.classNames.join(", ")}
                    {r.lastAt && ` · ${t("last practised {0}", formatDate(new Date(r.lastAt)))}`}
                    {r.outside > 0 && ` · ${t("{0} from the Practice menu", r.outside)}`}
                  </p>
                </div>
                {r.attempts > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => analyse("rule", [r.studentId], `${r.studentId}:rule`)} disabled={busy}>
                      <Wand2 /> {working === `${r.studentId}:rule` ? t("Writing…") : t("Automatic")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => analyse("ai", [r.studentId], `${r.studentId}:ai`)} disabled={busy}>
                      <Sparkles /> {working === `${r.studentId}:ai` ? t("AI is writing…") : t("AI")}
                    </Button>
                  </div>
                )}
              </div>

              {r.attempts === 0 ? (
                <p className="text-sm text-muted-foreground">{t("Not practised yet")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {r.kinds.map((k) => (
                      <div key={k.kind} className="rounded-lg bg-muted px-3 py-2 text-sm">
                        <span className="font-semibold">{t(PRACTICE_KIND_LABEL[k.kind])}</span>{" "}
                        <span className="text-xs text-muted-foreground">({t("{0}×", k.attempts)})</span>
                        <span className="ml-2">
                          {t("best")} <b className={scoreTone(k.best)}>{k.best}</b> · {t("last")} <b className={scoreTone(k.last)}>{k.last}</b>
                        </span>
                      </div>
                    ))}
                  </div>
                  {r.analysis ? (
                    <div className="rounded-lg border-l-4 border-primary bg-primary-soft/40 p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={r.analysis.source === "ai" ? "primary" : "neutral"}>{r.analysis.source === "ai" ? t("AI") : t("Automatic")}</Badge>
                        {r.analysis.attempts < r.attempts && <Badge tone="warning">{t("New attempts since this analysis")}</Badge>}
                      </div>
                      <p className="whitespace-pre-line">{r.analysis.text}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("No analysis yet. Use the Automatic or AI button.")}</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
