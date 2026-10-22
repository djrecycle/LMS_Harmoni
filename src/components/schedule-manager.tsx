"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle, Pencil, Play, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { deleteSchedule, saveSchedule } from "@/app/actions/schedule";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { DAYS, DAY_LABEL, isOngoing, nowWib, type DayOfWeek } from "@/lib/days";
import type { ScheduleRow } from "@/lib/schedule-data";
import { useT } from "@/i18n/client";

type Draft = { id?: string; hari: string; jamMulai: string; jamSelesai: string; mataPelajaran: string; classroomId: string; className: string; catatan: string };

const EMPTY: Draft = { hari: "senin", jamMulai: "07:00", jamSelesai: "08:20", mataPelajaran: "", classroomId: "", className: "", catatan: "" };

export function ScheduleManager({
  classrooms,
  rows,
  initialNow,
}: {
  classrooms: { id: string; name: string }[];
  rows: ScheduleRow[];
  /** Server's WIB day/time, so the first render matches; the browser keeps it current afterwards. */
  initialNow: { day: DayOfWeek; time: string };
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, start] = useTransition();
  const [error, setError] = useState("");

  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const id = setInterval(() => setNow(nowWib()), 20_000);
    return () => clearInterval(id);
  }, []);

  const byDay = useMemo(() => Object.fromEntries(DAYS.map((d) => [d, rows.filter((r) => r.hari === d)])), [rows]);

  function startAdd(hari: string) {
    setDraft({ ...EMPTY, hari });
    setOpen(true);
    setError("");
  }
  function startEdit(r: ScheduleRow) {
    setDraft({ id: r.id, hari: r.hari, jamMulai: r.jamMulai, jamSelesai: r.jamSelesai, mataPelajaran: r.mataPelajaran, classroomId: r.classroomId ?? "", className: r.classroomId ? "" : r.className, catatan: r.catatan ?? "" });
    setOpen(true);
    setError("");
  }

  function submit() {
    setError("");
    start(async () => {
      const r = await saveSchedule({ ...draft, catatan: draft.catatan || undefined, className: draft.className || undefined });
      if (!r.ok) return setError(r.error ?? t("Could not save the entry."));
      toast.success(r.message ?? t("Saved."));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      {!open ? (
        <div>
          <Button onClick={() => startAdd("senin")}>
            <Plus /> {t("Add schedule entry")}
          </Button>
        </div>
      ) : (
        <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{draft.id ? t("Edit entry") : t("New entry")}</h2>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("Close")}>
              <X />
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("Day")} htmlFor="sc-hari">
              <Select id="sc-hari" value={draft.hari} onChange={(e) => setDraft((d) => ({ ...d, hari: e.target.value }))}>
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {t(DAY_LABEL[day])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Start time")} htmlFor="sc-mulai">
              <Input id="sc-mulai" type="time" value={draft.jamMulai} onChange={(e) => setDraft((d) => ({ ...d, jamMulai: e.target.value }))} />
            </Field>
            <Field label={t("End time")} htmlFor="sc-selesai">
              <Input id="sc-selesai" type="time" value={draft.jamSelesai} onChange={(e) => setDraft((d) => ({ ...d, jamSelesai: e.target.value }))} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Subject")} htmlFor="sc-mapel">
              <Input id="sc-mapel" value={draft.mataPelajaran} onChange={(e) => setDraft((d) => ({ ...d, mataPelajaran: e.target.value }))} maxLength={120} />
            </Field>
            <Field label={t("Class")} htmlFor="sc-kelas">
              <Select id="sc-kelas" value={draft.classroomId} onChange={(e) => setDraft((d) => ({ ...d, classroomId: e.target.value, className: e.target.value ? "" : d.className }))}>
                <option value="">{t("Other (type below)")}</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!draft.classroomId && (
            <Field label={t("Class name")} htmlFor="sc-kelas-nama">
              <Input id="sc-kelas-nama" value={draft.className} onChange={(e) => setDraft((d) => ({ ...d, className: e.target.value }))} maxLength={80} />
            </Field>
          )}
          <Field label={t("Notes (optional)")} htmlFor="sc-catatan">
            <Textarea id="sc-catatan" rows={2} value={draft.catatan} onChange={(e) => setDraft((d) => ({ ...d, catatan: e.target.value }))} maxLength={500} />
          </Field>
          {error && <Alert kind="error">{error}</Alert>}
          <div>
            <Button onClick={submit} disabled={busy || draft.mataPelajaran.trim().length < 2}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save")}
            </Button>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {DAYS.map((day) => (
          <section key={day} className="grid gap-2 rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{t(DAY_LABEL[day])}</h3>
              <Button variant="ghost" size="sm" onClick={() => startAdd(day)}>
                <Plus /> {t("Add")}
              </Button>
            </div>
            {byDay[day].length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No classes scheduled.")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {byDay[day].map((r) => (
                  <li key={r.id} className={`grid gap-1 rounded-lg border p-2.5 text-sm ${r.classroomId && isOngoing(r, now) ? "border-danger/50 bg-danger-soft/30" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">
                        {r.jamMulai}–{r.jamSelesai}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => startEdit(r)} aria-label={t("Edit")}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <DeleteButton action={deleteSchedule} id={r.id} iconOnly size="sm" onDone={() => router.refresh()} />
                      </div>
                    </div>
                    <p className="font-semibold">{r.mataPelajaran}</p>
                    <p className="text-muted-foreground">{r.className}</p>
                    {r.catatan && <p className="text-xs text-muted-foreground">{r.catatan}</p>}
                    {r.classroomId && r.hari === now.day && <LiveButton id={r.id} state={isOngoing(r, now) ? "live" : now.time < r.jamMulai ? "soon" : "ended"} start={r.jamMulai} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

/** Today's entries linked to a class get a Live Class button: red while in session, plain before/after. */
function LiveButton({ id, state, start }: { id: string; state: "live" | "soon" | "ended"; start: string }) {
  const t = useT();
  return (
    <Button asChild variant={state === "live" ? "danger" : "outline"} size="sm" className="mt-1">
      <Link href={`/teacher/live/${id}`}>
        <Play className="fill-current" /> {state === "live" ? t("Live Class") : state === "soon" ? t("Live Class · starts {0}", start) : t("Live Class · ended")}
      </Link>
    </Button>
  );
}
