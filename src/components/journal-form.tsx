"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { deleteClassSession, saveClassSession } from "@/app/actions/journal";
import { getModulAjarUntukJurnal } from "@/app/actions/perangkat";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { AttendanceMap, AttendanceStatus, ModulAjarOption, RosterMember } from "@/lib/journal-data";

type Pertemuan = { value: string; label: string; materi: string; kegiatan: string };

const STATUS: { id: AttendanceStatus; tone: string }[] = [
  { id: "hadir", tone: "bg-success-soft text-success" },
  { id: "sakit", tone: "bg-warning-soft text-accent-foreground" },
  { id: "izin", tone: "bg-primary-soft text-primary" },
  { id: "alpa", tone: "bg-danger-soft text-danger" },
];

export function JournalForm({
  sessionId,
  classroomId,
  classroomName,
  initialTanggal,
  roster,
  initialAttendance,
  initial,
  modulAjarOptions,
}: {
  sessionId?: string;
  classroomId: string;
  classroomName: string;
  initialTanggal: string;
  roster: RosterMember[];
  initialAttendance: AttendanceMap;
  initial: { waktu: string; materi: string; kegiatan: string; kendala: string; catatan: string };
  modulAjarOptions: ModulAjarOption[];
}) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [attendance, setAttendance] = useState<AttendanceMap>(() =>
    Object.fromEntries(roster.map((s) => [s.id, initialAttendance[s.id] ?? { status: "hadir" as AttendanceStatus, keterangan: "" }])),
  );
  const [materi, setMateri] = useState(initial.materi);
  const [kegiatan, setKegiatan] = useState(initial.kegiatan);
  const [modulAjarId, setModulAjarId] = useState("");
  const [pertemuanList, setPertemuanList] = useState<Pertemuan[]>([]);
  const [pertemuanIdx, setPertemuanIdx] = useState("");
  const [modulError, setModulError] = useState("");
  const [loadingModul, startLoadModul] = useTransition();

  function chooseModul(id: string) {
    setModulAjarId(id);
    setPertemuanList([]);
    setPertemuanIdx("");
    setModulError("");
    if (!id) return;
    startLoadModul(async () => {
      const r = await getModulAjarUntukJurnal(id);
      if (!r.ok || !r.data) return setModulError(r.error ?? t("Could not load this Modul Ajar."));
      setPertemuanList(r.data.pertemuan);
      if (r.data.pertemuan.length === 1) setPertemuanIdx("0");
    });
  }

  const chosenPertemuan = pertemuanList.find((p) => p.value === pertemuanIdx) ?? null;

  // Only offer Modul Ajar docs tagged for this class (e.g. "Kelas VII A" matches a doc tagged "VII") —
  // a doc with no class tag at all can't be confidently matched, so it's left out rather than guessed at.
  const classTokens = classroomName.toUpperCase().split(/\s+/).filter(Boolean);
  const modulForThisClass = modulAjarOptions.filter((m) => m.kelas.trim() && classTokens.includes(m.kelas.trim().toUpperCase()));

  function fillFromModul() {
    if (!chosenPertemuan) return;
    setMateri(chosenPertemuan.materi);
    if (chosenPertemuan.kegiatan) setKegiatan(chosenPertemuan.kegiatan);
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setAttendance((a) => ({ ...a, [studentId]: { ...a[studentId], status } }));
  }
  function setNote(studentId: string, keterangan: string) {
    setAttendance((a) => ({ ...a, [studentId]: { ...a[studentId], keterangan } }));
  }
  function setAllHadir() {
    setAttendance((a) => Object.fromEntries(Object.keys(a).map((id) => [id, { ...a[id], status: "hadir" as AttendanceStatus }])));
  }

  function submit(formData: FormData) {
    setError("");
    const payload = {
      id: sessionId,
      classroomId,
      tanggal: String(formData.get("tanggal")),
      waktu: String(formData.get("waktu") || ""),
      materi,
      kegiatan,
      kendala: String(formData.get("kendala") || ""),
      catatan: String(formData.get("catatan") || ""),
      attendance: roster.map((s) => ({ studentId: s.id, status: attendance[s.id]?.status ?? "hadir", keterangan: attendance[s.id]?.keterangan || undefined })),
    };
    start(async () => {
      const r = await saveClassSession(payload);
      if (r && !r.ok) setError(r.error ?? t("Could not save the entry."));
      // A successful save redirects server-side (see saveClassSession), so there is no success branch here.
    });
  }

  const hadirCount = Object.values(attendance).filter((a) => a.status === "hadir").length;

  return (
    <form action={submit} className="grid gap-5">
      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <h2 className="text-lg font-bold">{t("Journal")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Date")} htmlFor="js-tanggal">
            <Input id="js-tanggal" name="tanggal" type="date" defaultValue={initialTanggal} required />
          </Field>
          <Field label={t("Time / period")} htmlFor="js-waktu" hint={t('Example: "Jam ke-3-4" or "07:00-08:20"')}>
            <Input id="js-waktu" name="waktu" defaultValue={initial.waktu} maxLength={80} />
          </Field>
        </div>
        <div className="grid gap-3 rounded-lg border border-dashed p-3">
          {modulForThisClass.length > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label={t("Fill from a Modul Ajar")} htmlFor="js-modul">
                  <Select id="js-modul" value={modulAjarId} onChange={(e) => chooseModul(e.target.value)}>
                    <option value="">{t("— choose a Modul Ajar —")}</option>
                    {modulForThisClass.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                {pertemuanList.length > 1 && (
                  <Field label={t("Meeting")} htmlFor="js-pertemuan">
                    <Select id="js-pertemuan" value={pertemuanIdx} onChange={(e) => setPertemuanIdx(e.target.value)}>
                      <option value="">{t("— choose —")}</option>
                      {pertemuanList.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
              {modulError && <p className="text-xs font-medium text-danger">{modulError}</p>}
              <div>
                <Button type="button" variant="secondary" size="sm" disabled={!chosenPertemuan || loadingModul} onClick={fillFromModul}>
                  {loadingModul ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {t("Fill in material and activities")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{t("This class has no Modul Ajar yet.")}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/teacher/perangkat-ajar">
                  <Sparkles /> {t("Create one in Teaching Documents")}
                </Link>
              </Button>
            </div>
          )}
        </div>
        <Field label={t("Material taught")} htmlFor="js-materi">
          <Textarea id="js-materi" name="materi" rows={2} value={materi} onChange={(e) => setMateri(e.target.value)} maxLength={2000} />
        </Field>
        <Field label={t("Learning activities")} htmlFor="js-kegiatan">
          <Textarea id="js-kegiatan" name="kegiatan" rows={3} value={kegiatan} onChange={(e) => setKegiatan(e.target.value)} maxLength={4000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Difficulties / obstacles")} htmlFor="js-kendala">
            <Textarea id="js-kendala" name="kendala" rows={2} defaultValue={initial.kendala} maxLength={2000} />
          </Field>
          <Field label={t("Notes")} htmlFor="js-catatan">
            <Textarea id="js-catatan" name="catatan" rows={2} defaultValue={initial.catatan} maxLength={2000} />
          </Field>
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            {t("Attendance (")}{hadirCount}/{roster.length})
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={setAllHadir}>
            <CircleCheck /> {t("Mark everyone present")}
          </Button>
        </div>
        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("This class has no students yet.")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2">
            {roster.map((s) => {
              const a = attendance[s.id] ?? { status: "hadir" as AttendanceStatus, keterangan: "" };
              return (
                <li key={s.id} className="grid gap-2 rounded-lg border p-2.5 sm:grid-cols-[1fr_auto_14rem] sm:items-center">
                  <span className="min-w-0 break-words font-semibold">{s.name}</span>
                  <div className="flex flex-wrap gap-1">
                    {STATUS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStatus(s.id, opt.id)}
                        className={cn("rounded-full px-3 py-1 text-xs font-bold uppercase transition-colors", a.status === opt.id ? opt.tone : "bg-muted text-muted-foreground hover:brightness-95")}
                      >
                        {t(opt.id)}
                      </button>
                    ))}
                  </div>
                  {a.status !== "hadir" && (
                    <Input value={a.keterangan} onChange={(e) => setNote(s.id, e.target.value)} placeholder={t("Note (optional)")} maxLength={200} className="h-9 text-sm" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save entry")}
        </Button>
        {sessionId && (
          <DeleteButton
            action={deleteClassSession}
            id={sessionId}
            label={t("Delete entry")}
            confirmText="Delete this entry?"
            onDone={() => {
              toast.success(t("Entry deleted."));
              router.push("/teacher/journal");
            }}
          />
        )}
      </div>
    </form>
  );
}
