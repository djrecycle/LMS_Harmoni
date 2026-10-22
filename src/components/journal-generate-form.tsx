"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarClock, LoaderCircle, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { generateJournalEntries, previewJournalGeneration } from "@/app/actions/journal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { DAY_LABEL, dayOfWeekFromDate } from "@/lib/days";
import type { GeneratedRow } from "@/lib/journal-generate";
import { addDays, formatDate, today } from "@/lib/utils";
import { useT } from "@/i18n/client";

const STATUS_TONE = {
  new: "success",
  exists: "neutral",
  holiday: "warning",
  outside_term: "neutral",
} as const;

export function JournalGenerateForm({ classrooms, unlinkedScheduleCount }: { classrooms: { id: string; name: string }[]; unlinkedScheduleCount: number }) {
  const t = useT();
  const router = useRouter();
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(addDays(today(), 6));
  const [classroomId, setClassroomId] = useState("");
  const [rows, setRows] = useState<GeneratedRow[] | null>(null);
  const [error, setError] = useState("");
  const [previewing, startPreview] = useTransition();
  const [creating, startCreate] = useTransition();

  const STATUS_LABEL: Record<GeneratedRow["status"], string> = {
    new: t("Will be created"),
    exists: t("Already exists"),
    holiday: t("Holiday"),
    outside_term: t("Outside the school term"),
  };

  function runPreview(range: { start: string; end: string }) {
    setError("");
    startPreview(async () => {
      const r = await previewJournalGeneration({ ...range, classroomId: classroomId || undefined });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not build the preview."));
      setRows(r.data.rows);
    });
  }

  function preview() {
    runPreview({ start, end });
  }

  /** Quick button: jump straight to today and check it, without touching the date fields first. */
  function checkToday() {
    const day = today();
    setStart(day);
    setEnd(day);
    runPreview({ start: day, end: day });
  }

  function create() {
    setError("");
    startCreate(async () => {
      const r = await generateJournalEntries({ start, end, classroomId: classroomId || undefined });
      if (!r.ok) return setError(r.error ?? t("Could not create the entries."));
      toast.success(r.message ?? t("Entries created."));
      setRows(null);
      router.refresh();
    });
  }

  const busy = previewing || creating;
  const newCount = rows?.filter((r) => r.status === "new").length ?? 0;
  const counts = rows
    ? { new: newCount, exists: rows.filter((r) => r.status === "exists").length, holiday: rows.filter((r) => r.status === "holiday").length, outside_term: rows.filter((r) => r.status === "outside_term").length }
    : null;

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CalendarClock className="size-5" /> {t("Generate from schedule")}
        </h2>
        <Button variant="outline" size="sm" onClick={checkToday} disabled={busy}>
          <CalendarCheck2 /> {t("Check today")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("Automatically create entries for the classes on your weekly schedule, for the date range below — skipping holidays from your academic calendar and dates that already have an entry.")}
      </p>
      <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,12rem))_auto] sm:items-end">
        <Field label={t("Start date")} htmlFor="jg-start">
          <Input id="jg-start" type="date" value={start} onChange={(e) => { setStart(e.target.value); setRows(null); }} disabled={busy} />
        </Field>
        <Field label={t("End date")} htmlFor="jg-end">
          <Input id="jg-end" type="date" value={end} onChange={(e) => { setEnd(e.target.value); setRows(null); }} disabled={busy} />
        </Field>
        <Field label={t("Class")} htmlFor="jg-class">
          <Select id="jg-class" value={classroomId} onChange={(e) => { setClassroomId(e.target.value); setRows(null); }} disabled={busy}>
            <option value="">{t("All classes")}</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={preview} disabled={busy}>
          {previewing ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {t("Preview")}
        </Button>
      </div>

      {unlinkedScheduleCount > 0 && (
        <Alert kind="warning">
          {t("{0} schedule entries aren't linked to a class yet, so they can't produce a journal entry.", unlinkedScheduleCount)}{" "}
          <Link href="/teacher/schedule" className="font-semibold underline">
            {t("Link them in Teaching Schedule")}
          </Link>
          .
        </Alert>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      {rows && (
        <div className="grid gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {counts!.new > 0 && <Badge tone="success">{t("{0} new", counts!.new)}</Badge>}
              {counts!.exists > 0 && <Badge>{t("{0} already exist", counts!.exists)}</Badge>}
              {counts!.holiday > 0 && <Badge tone="warning">{t("{0} holidays", counts!.holiday)}</Badge>}
              {counts!.outside_term > 0 && <Badge>{t("{0} outside term", counts!.outside_term)}</Badge>}
            </div>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setRows(null)} aria-label={t("Close")}>
              <X className="size-4" />
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No scheduled classes fall in this date range.")}</p>
          ) : (
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">{t("Date")}</th>
                    <th className="px-2 py-1.5 font-semibold">{t("Day")}</th>
                    <th className="px-2 py-1.5 font-semibold">{t("Class")}</th>
                    <th className="px-2 py-1.5 font-semibold">{t("Subject")}</th>
                    <th className="px-2 py-1.5 font-semibold">{t("Status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(r.tanggal)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{t(DAY_LABEL[dayOfWeekFromDate(r.tanggal)])}</td>
                      <td className="px-2 py-1.5">{r.classroomName}</td>
                      <td className="px-2 py-1.5">{r.mataPelajaran}</td>
                      <td className="px-2 py-1.5">
                        <Badge tone={STATUS_TONE[r.status]}>{r.note && r.status === "holiday" ? r.note : STATUS_LABEL[r.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {newCount > 0 && (
            <div>
              <Button onClick={create} disabled={creating}>
                {creating ? <LoaderCircle className="animate-spin" /> : <CalendarClock />} {t("Create {0} entries", newCount)}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">{t("Each entry is created with everyone marked present — adjust it after class if needed.")}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
