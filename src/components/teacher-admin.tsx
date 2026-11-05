"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, LoaderCircle, Save, Search, Sparkles, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { deleteTeacher, savePlatform, setTeacherQuota, setTeacherStatus } from "@/app/actions/admin";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge, Progress } from "@/components/ui/misc";
import type { AdminOverview, TeacherRow } from "@/lib/admin-data";
import { formatBytes } from "@/lib/utils";
import { useT } from "@/i18n/client";

const MB = 1024 * 1024;
const STATUS_TONE = { pending: "warning", active: "success", suspended: "danger" } as const;
const STATUS_LABEL = { pending: "Waiting for approval", active: "Active", suspended: "Suspended" } as const;

export function TeacherAdmin({ overview }: { overview: AdminOverview }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [form, setForm] = useState({
    registrationOpen: overview.settings.registrationOpen,
    maxTeachers: String(overview.settings.maxTeachers),
    defaultStorageMb: String(overview.settings.defaultStorageMb),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"" | TeacherRow["status"]>("");

  function saveSettings() {
    setErrors({});
    start(async () => {
      const r = await savePlatform({ registrationOpen: form.registrationOpen, maxTeachers: Number(form.maxTeachers), defaultStorageMb: Number(form.defaultStorageMb) });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.error ?? t("Could not save the settings."));
      }
      toast.success(r.message ?? t("Saved."));
      router.refresh();
    });
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overview.teachers.filter((x) => (!filter || x.status === filter) && (!q || x.name.toLowerCase().includes(q) || x.email.toLowerCase().includes(q) || x.schoolName.toLowerCase().includes(q)));
  }, [overview.teachers, query, filter]);

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div>
          <h2 className="text-lg font-bold">{t("Teacher registration & space")}</h2>
          <p className="text-sm text-muted-foreground">{t("New teachers always wait for your approval. Students can't sign up themselves: teachers create their accounts.")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("Teacher registration")} htmlFor="pf-open">
            <Select id="pf-open" value={form.registrationOpen ? "open" : "closed"} onChange={(e) => setForm((f) => ({ ...f, registrationOpen: e.target.value === "open" }))}>
              <option value="open">{t("Open")}</option>
              <option value="closed">{t("Closed")}</option>
            </Select>
          </Field>
          <Field label={t("Maximum number of teachers")} htmlFor="pf-max" hint={t("Not counting you. Waiting and suspended teachers count too.")} error={errors.maxTeachers}>
            <Input id="pf-max" inputMode="numeric" value={form.maxTeachers} onChange={(e) => setForm((f) => ({ ...f, maxTeachers: e.target.value.replace(/\D/g, "").slice(0, 5) }))} />
          </Field>
          <Field label={t("Upload space per teacher (MB)")} htmlFor="pf-space" hint={t("For images, audio and video. Can be changed per teacher below.")} error={errors.defaultStorageMb}>
            <Input id="pf-space" inputMode="numeric" value={form.defaultStorageMb} onChange={(e) => setForm((f) => ({ ...f, defaultStorageMb: e.target.value.replace(/\D/g, "").slice(0, 7) }))} />
          </Field>
        </div>
        <div>
          <Button onClick={saveSettings} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save settings")}
          </Button>
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">{t("Teachers")}</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search name, school or email")} className="h-10 w-56 pl-9" aria-label={t("Search name, school or email")} />
            </div>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-10 w-48" aria-label={t("Filter by status")}>
              <option value="">{t("All statuses")}</option>
              {(Object.keys(STATUS_LABEL) as TeacherRow["status"][]).map((s) => (
                <option key={s} value={s}>
                  {t(STATUS_LABEL[s])}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-6 text-center text-sm text-muted-foreground">{t("No teacher matches.")}</p>
        ) : (
          <ul className="grid gap-3">
            {shown.map((x) => (
              <TeacherItem key={x.id} teacher={x} defaultMb={overview.settings.defaultStorageMb} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TeacherItem({ teacher: x, defaultMb }: { teacher: TeacherRow; defaultMb: number }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [quota, setQuota] = useState(x.quotaMb === null ? "" : String(x.quotaMb));
  const quotaMb = x.quotaMb ?? defaultMb;
  const percent = x.isAdmin ? 0 : Math.min(100, Math.round((x.usedBytes / (quotaMb * MB)) * 100));

  function status(next: "active" | "suspended") {
    start(async () => {
      const r = await setTeacherStatus({ id: x.id, status: next });
      if (!r.ok) return void toast.error(r.error ?? t("Something went wrong."));
      toast.success(r.message ?? t("Saved."));
      router.refresh();
    });
  }

  function saveQuota() {
    start(async () => {
      const r = await setTeacherQuota({ id: x.id, quotaMb: quota.trim() === "" ? null : Number(quota) });
      if (!r.ok) return void toast.error(r.fieldErrors?.quotaMb ?? r.error ?? t("Something went wrong."));
      toast.success(r.message ?? t("Saved."));
      router.refresh();
    });
  }

  return (
    <li className="grid gap-3 rounded-lg border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {x.isAdmin ? <Badge tone="primary">{t("Super Admin")}</Badge> : <Badge tone={STATUS_TONE[x.status]}>{t(STATUS_LABEL[x.status])}</Badge>}
        {!x.isAdmin && (
          <Badge tone={x.aiReady ? "success" : "neutral"}>
            <Sparkles className="size-3" /> {x.aiReady ? t("AI key set") : t("No AI key yet")}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {t("Registered")} {new Date(x.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="min-w-0">
        <p className="font-semibold leading-snug break-words">{x.name}</p>
        <p className="text-sm break-words">{x.schoolName || <span className="text-muted-foreground italic">{t("School not filled in yet")}</span>}</p>
        <p className="text-sm break-all text-muted-foreground">{x.email}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("{0} classes · {1} students · {2} lessons · {3} teaching documents", x.classes, x.students, x.lessons, x.documents)}
      </p>

      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">{t("Upload space")}</span>
          <span className="text-muted-foreground tabular-nums">{x.isAdmin ? `${formatBytes(x.usedBytes)} · ${t("no limit")}` : `${formatBytes(x.usedBytes)} / ${quotaMb} MB`}</span>
        </div>
        {!x.isAdmin && <Progress value={percent} label={t("Upload space used")} />}
      </div>

      {!x.isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("Own upload space (MB)")} htmlFor={`quota-${x.id}`} hint={t("Empty = the default ({0} MB).", defaultMb)}>
            <Input id={`quota-${x.id}`} inputMode="numeric" className="h-9 w-36" value={quota} placeholder={String(defaultMb)} onChange={(e) => setQuota(e.target.value.replace(/\D/g, "").slice(0, 7))} />
          </Field>
          <Button size="sm" variant="outline" disabled={busy || quota === (x.quotaMb === null ? "" : String(x.quotaMb))} onClick={saveQuota}>
            <Save /> {t("Save")}
          </Button>

          <span className="ml-auto flex flex-wrap items-center gap-2">
            {x.status === "pending" && (
              <Button size="sm" disabled={busy} onClick={() => status("active")}>
                {busy ? <LoaderCircle className="animate-spin" /> : <UserCheck />} {t("Approve")}
              </Button>
            )}
            {x.status === "suspended" && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => status("active")}>
                <Check /> {t("Reactivate")}
              </Button>
            )}
            {x.status === "active" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => status("suspended")}>
                <Ban /> {t("Suspend")}
              </Button>
            )}
            <DeleteButton
              action={deleteTeacher}
              id={x.id}
              label={x.status === "pending" ? t("Reject & delete") : t("Delete")}
              confirmText={t("Delete this teacher and ALL their classes, lessons and files?")}
              onDone={() => router.refresh()}
            />
          </span>
        </div>
      )}
    </li>
  );
}
