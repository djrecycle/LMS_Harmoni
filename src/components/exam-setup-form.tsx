"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ListChecks, Pencil, Puzzle, SlidersHorizontal, SquareCheckBig, Text } from "lucide-react";
import { toast } from "sonner";
import { saveExam } from "@/app/actions/exam";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { EXAM_SECTIONS, EXAM_TYPES, totalCount, totalWeight, type ExamComposition, type ExamInfo, type ExamSection } from "@/lib/exam";
import type { CpGroup } from "@/lib/perangkat/view";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type ExamSetup = { id?: string; title: string; info: ExamInfo; tps: string[]; composition: ExamComposition };

/** Card look of each section, like the CBT app's "Komposisi jumlah & bobot soal" panel. */
const SECTION_LOOK: Record<ExamSection, { title: string; Icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  pg: { title: "Multiple choice", Icon: CircleCheck, tone: "border-l-blue-500 text-blue-600 dark:text-blue-400" },
  pgk: { title: "Complex multiple choice", Icon: SquareCheckBig, tone: "border-l-amber-500 text-amber-600 dark:text-amber-400" },
  jodoh: { title: "Matching", Icon: Puzzle, tone: "border-l-red-500 text-red-600 dark:text-red-400" },
  isian: { title: "Short answer", Icon: Pencil, tone: "border-l-green-600 text-green-700 dark:text-green-400" },
  uraian: { title: "Essay", Icon: Text, tone: "border-l-slate-500 text-slate-600 dark:text-slate-300" },
};

const SEMESTERS = ["I (Ganjil)", "II (Genap)"];

export function ExamSetupForm({ initial, cpGroups }: { initial: ExamSetup; cpGroups: CpGroup[] }) {
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [info, setInfo] = useState<ExamInfo>(initial.info);
  const setI = (p: Partial<ExamInfo>) => setInfo((a) => ({ ...a, ...p }));
  const [tps, setTps] = useState<string[]>(initial.tps);
  const [comp, setComp] = useState<ExamComposition>(initial.composition);
  const [manual, setManual] = useState("");
  const kelasOptions = [...new Set(cpGroups.map((g) => g.context.kelas).filter(Boolean))].sort();
  const [cpKelas, setCpKelas] = useState(() => (info.kelas && kelasOptions.includes(info.kelas) ? info.kelas : ""));
  const [error, setError] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();

  const groups = cpKelas ? cpGroups.filter((g) => g.context.kelas === cpKelas) : cpGroups;
  const known = useMemo(() => new Set(cpGroups.flatMap((g) => g.tps.map((x) => x.tp))), [cpGroups]);
  const ownTps = tps.filter((x) => !known.has(x));
  const toggle = (tp: string) => setTps((a) => (a.includes(tp) ? a.filter((x) => x !== tp) : [...a, tp]));

  /** Choosing a CP-TP-ATP's class also fills the subject / class / phase / year when they are still empty. */
  function chooseKelas(k: string) {
    setCpKelas(k);
    const g = cpGroups.find((x) => x.context.kelas === k);
    if (g) setInfo((a) => ({ ...a, mata_pelajaran: a.mata_pelajaran || g.context.mata_pelajaran, kelas: a.kelas || g.context.kelas, fase: a.fase || g.context.fase, tahun_ajaran: a.tahun_ajaran || g.context.tahun_ajaran }));
  }

  function addManual() {
    const lines = manual.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!lines.length) return;
    setTps((a) => [...new Set([...a, ...lines])]);
    setManual("");
  }

  const setPlan = (s: ExamSection, key: "count" | "weight", value: string) => {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    setComp((c) => ({ ...c, [s]: { ...c[s], [key]: key === "count" ? Math.round(n) : n } }));
  };
  const sumCount = totalCount(comp);
  const sumWeight = Math.round(totalWeight(comp) * 100) / 100;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError({});
    start(async () => {
      const r = await saveExam({ title, info, tps, composition: comp }, initial.id);
      if (!r.ok || !r.data) {
        setError(r.fieldErrors ?? {});
        toast.error(r.error ?? t("Could not save."));
        return;
      }
      toast.success(r.message);
      router.push(`/teacher/exams/${r.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-8">
      {/* 1. Identity */}
      <section className="grid gap-4">
        <h2 className="text-lg font-bold">1. {t("Exam identity")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Exam title")} htmlFor="ex-title" error={error.title} className="sm:col-span-2">
            <Input id="ex-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PSAT Seni Musik Kelas 7" required maxLength={150} />
          </Field>
          <Field label={t("Exam type")} htmlFor="ex-jenis">
            <Input id="ex-jenis" list="ex-jenis-list" value={info.jenis_ujian ?? ""} onChange={(e) => setI({ jenis_ujian: e.target.value })} maxLength={80} />
            <datalist id="ex-jenis-list">
              {EXAM_TYPES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label={t("Subject")} htmlFor="ex-mapel">
            <Input id="ex-mapel" value={info.mata_pelajaran ?? ""} onChange={(e) => setI({ mata_pelajaran: e.target.value })} maxLength={120} />
          </Field>
          <Field label={t("Class")} htmlFor="ex-kelas">
            <Input id="ex-kelas" value={info.kelas ?? ""} onChange={(e) => setI({ kelas: e.target.value })} maxLength={40} placeholder="VII" />
          </Field>
          <Field label={t("Phase")} htmlFor="ex-fase">
            <Input id="ex-fase" value={info.fase ?? ""} onChange={(e) => setI({ fase: e.target.value })} maxLength={20} placeholder="D" />
          </Field>
          <Field label={t("Semester")} htmlFor="ex-sem">
            <Select id="ex-sem" value={info.semester ?? ""} onChange={(e) => setI({ semester: e.target.value })}>
              <option value="">{t("Not set")}</option>
              {SEMESTERS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("School year")} htmlFor="ex-ta">
            <Input id="ex-ta" value={info.tahun_ajaran ?? ""} onChange={(e) => setI({ tahun_ajaran: e.target.value })} maxLength={20} placeholder="2026/2027" />
          </Field>
          <Field label={t("Time allocation")} htmlFor="ex-waktu">
            <Input id="ex-waktu" value={info.alokasi_waktu ?? ""} onChange={(e) => setI({ alokasi_waktu: e.target.value })} maxLength={60} placeholder="90 menit" />
          </Field>
          <Field label={t("School")} htmlFor="ex-sekolah">
            <Input id="ex-sekolah" value={info.nama_sekolah ?? ""} onChange={(e) => setI({ nama_sekolah: e.target.value })} maxLength={160} />
          </Field>
        </div>
      </section>

      {/* 2. TP */}
      <section className="grid gap-4">
        <div>
          <h2 className="text-lg font-bold">2. {t("Learning objectives (CP/TP) to test")}</h2>
          <p className="text-sm text-muted-foreground">{t("Tick the TP from your CP-TP-ATP documents, or type your own. The AI spreads the questions over the chosen TP.")}</p>
        </div>
        {cpGroups.length === 0 ? (
          <Alert kind="info">{t("No CP-TP-ATP documents yet. Make one in Teaching Documents, or type the TP below.")}</Alert>
        ) : (
          <>
            {kelasOptions.length > 1 && (
              <Field label={t("Show TP of class")} htmlFor="ex-cpkelas" className="sm:w-64">
                <Select id="ex-cpkelas" value={cpKelas} onChange={(e) => chooseKelas(e.target.value)}>
                  <option value="">{t("All classes")}</option>
                  {kelasOptions.map((k) => (
                    <option key={k} value={k}>
                      {t("Class {0}", k)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {groups.map((g) => {
              const all = g.tps.every((x) => tps.includes(x.tp));
              return (
                <div key={g.cpId} className="rounded-xl border bg-card p-3 sm:p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 font-semibold break-words">{g.cpTitle}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTps((a) => (all ? a.filter((x) => !g.tps.some((y) => y.tp === x)) : [...new Set([...a, ...g.tps.map((x) => x.tp)])]))}
                    >
                      <ListChecks /> {all ? t("Untick all") : t("Tick all")}
                    </Button>
                  </div>
                  <ul className="grid gap-1.5">
                    {g.tps.map((x) => (
                      <li key={x.tp}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-1.5 text-sm hover:bg-muted">
                          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" checked={tps.includes(x.tp)} onChange={() => toggle(x.tp)} />
                          <span className="min-w-0 break-words">
                            {x.tp}
                            {(x.semester || x.babJudul) && <span className="block text-xs text-muted-foreground">{[x.semester, x.babJudul].filter(Boolean).join(" · ")}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        )}
        <div className="grid gap-2">
          <Field label={t("Your own TP (one per line)")} htmlFor="ex-manual">
            <Textarea id="ex-manual" rows={2} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("Students can explain breathing technique in singing")} />
          </Field>
          <div>
            <Button variant="outline" size="sm" onClick={addManual} disabled={!manual.trim()}>
              {t("Add TP")}
            </Button>
          </div>
          {ownTps.length > 0 && (
            <ul className="grid gap-1.5">
              {ownTps.map((x) => (
                <li key={x}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" checked onChange={() => toggle(x)} />
                    <span className="min-w-0 break-words">{x}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className={cn("text-sm font-semibold", tps.length ? "text-success" : "text-muted-foreground")}>{t("{0} TP chosen", tps.length)}</p>
      </section>

      {/* 3. Composition */}
      <section className="grid gap-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <SlidersHorizontal className="size-5 text-primary" />
          <h2 className="text-lg font-bold">3. {t("Number of questions & weights")}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EXAM_SECTIONS.map((s) => {
            const look = SECTION_LOOK[s];
            return (
              <div key={s} className={cn("rounded-xl border border-l-4 bg-card p-4 shadow-xs", look.tone, s === "pg" && "lg:col-span-2")}>
                <p className="mb-3 flex items-center gap-2 font-bold">
                  <look.Icon className="size-5" /> {t(look.title)}
                </p>
                <div className={cn("grid gap-3 text-foreground", s === "pg" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
                  <Field label={t("Questions")} htmlFor={`ex-${s}-n`}>
                    <Input id={`ex-${s}-n`} type="number" min={0} max={100} value={comp[s].count} onChange={(e) => setPlan(s, "count", e.target.value)} className="text-center font-bold" />
                  </Field>
                  <Field label={t("Weight %")} htmlFor={`ex-${s}-w`}>
                    <Input id={`ex-${s}-w`} type="number" min={0} max={100} step="any" value={comp[s].weight} onChange={(e) => setPlan(s, "weight", e.target.value)} className="text-center font-bold" />
                  </Field>
                  {s === "pg" && (
                    <Field label={t("Answer choices")} htmlFor="ex-pg-opt" className="col-span-2 sm:col-span-1">
                      <Select id="ex-pg-opt" value={comp.pgOptions} onChange={(e) => setComp((c) => ({ ...c, pgOptions: e.target.value === "5" ? 5 : 4 }))}>
                        <option value={4}>4 (A, B, C, D)</option>
                        <option value={5}>5 (A, B, C, D, E)</option>
                      </Select>
                    </Field>
                  )}
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-2 items-center rounded-xl border bg-muted/50 p-4 text-center">
            <div>
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("Total questions")}</p>
              <p className="text-3xl font-extrabold text-primary">{sumCount}</p>
            </div>
            <div className="border-l">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("Total weight")}</p>
              <p className={cn("text-3xl font-extrabold", sumWeight === 100 ? "text-success" : "text-danger")}>{sumWeight}</p>
            </div>
          </div>
        </div>
        {sumWeight !== 100 && <Alert kind="warning">{t("The weights should add up to 100. The grade is still scaled to 0-100, but the documents and sections will not match your plan.")}</Alert>}
        <p className="text-xs text-muted-foreground">{t("Each section's weight is shared equally by its questions. Complex multiple choice and matching give partial points.")}</p>
      </section>

      <div>
        <Button type="submit" size="lg" disabled={busy || sumCount === 0}>
          {busy ? t("Saving…") : initial.id ? t("Save changes") : t("Create exam")}
        </Button>
      </div>
    </form>
  );
}
