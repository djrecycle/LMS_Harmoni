"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, LoaderCircle, PlugZap, Save, X } from "lucide-react";
import { toast } from "sonner";
import { approveAiDemo, rejectAiDemo, revokeAiDemo, saveAiDemoSettings, testAiDemoConnection } from "@/app/actions/ai-demo";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert, Badge, EmptyState } from "@/components/ui/misc";
import type { DemoConfigView, DemoRequestRow } from "@/lib/ai-demo";
import { formatDateTime } from "@/lib/utils";
import { useT } from "@/i18n/client";

const TONE = { pending: "warning", approved: "success", expired: "neutral", rejected: "danger", revoked: "neutral" } as const;
const LABEL = { pending: "Waiting for approval", approved: "Active", expired: "Ended", rejected: "Rejected", revoked: "Ended by you" } as const;
const DAYS = [3, 7, 14, 30];

export function AiDemoAdmin({ config, requests }: { config: DemoConfigView; requests: DemoRequestRow[] }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [form, setForm] = useState({ enabled: config.enabled, baseUrl: config.baseUrl, key: "", days: String(config.days), model: config.model });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [advice, setAdvice] = useState<string | null>(null);

  function save() {
    setErrors({});
    start(async () => {
      const r = await saveAiDemoSettings({ ...form, days: Number(form.days) });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.error ?? t("Could not save the settings."));
      }
      toast.success(r.message ?? t("Saved."));
      setForm((f) => ({ ...f, key: "" }));
      router.refresh();
    });
  }

  function test() {
    setAdvice(null);
    start(async () => {
      const r = await testAiDemoConnection();
      if (!r.ok) return void toast.error(r.error ?? t("Could not reach the demo API."));
      setAdvice(r.message ?? null);
      if (r.data?.sumber === "perkiraan") toast.info(t("The allowance is still a rough estimate: the token panel calibrates it from your Claude Pro usage over time."));
    });
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div>
          <h2 className="text-lg font-bold">{t("Connection to the demo API")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Your private Claude API. Create an LMS key in the token panel (section “Kunci LMS”) and paste it here. The key can only create, check and end demo tokens.")}
          </p>
        </div>
        {config.keyUnreadable && <Alert kind="warning">{t("The saved LMS key can't be read any more (the server secret changed). Paste it again.")}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("AI demo for teachers")} htmlFor="dm-on">
            <Select id="dm-on" value={form.enabled ? "on" : "off"} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.value === "on" }))}>
              <option value="on">{t("On: teachers can ask for it")}</option>
              <option value="off">{t("Off: the button is hidden")}</option>
            </Select>
          </Field>
          <Field label={t("Demo API address")} htmlFor="dm-url" hint={t("Without /v1, e.g. https://api.musicclass.tech")} error={errors.baseUrl}>
            <Input id="dm-url" placeholder="https://api.musicclass.tech" value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} />
          </Field>
          <Field label={t("LMS key")} htmlFor="dm-key" hint={config.keySet ? t("Saved ({0}). Leave empty to keep it.", config.keyHint) : t("Starts with lms_")} error={errors.key}>
            <Input id="dm-key" type="password" autoComplete="off" placeholder={config.keySet ? "••••••••" : "lms_…"} value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Demo length")} htmlFor="dm-days" error={errors.days}>
              <Select id="dm-days" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {t("{0} days", d)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Model")} htmlFor="dm-model">
              <Select id="dm-model" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}>
                <option value="sonnet">sonnet</option>
                <option value="haiku">{t("haiku (faster, lighter)")}</option>
                <option value="opus">{t("opus (strongest, uses more)")}</option>
              </Select>
            </Field>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save settings")}
          </Button>
          <Button variant="outline" onClick={test} disabled={busy || !config.keySet}>
            <PlugZap /> {t("Test connection")}
          </Button>
          {advice && <span className="text-sm text-success">{advice}</span>}
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <h2 className="text-lg font-bold">{t("Requests")}</h2>
        {requests.length === 0 ? (
          <EmptyState title={t("No requests yet")}>{t("Teachers ask for the demo on their AI Settings page.")}</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {requests.map((r) => (
              <RequestRow key={r.userId} r={r} defaultDays={config.days} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestRow({ r, defaultDays }: { r: DemoRequestRow; defaultDays: number }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [days, setDays] = useState(String(defaultDays));
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    start(async () => {
      const res = await action();
      if (!res.ok) return void toast.error(res.error ?? t("Something went wrong."));
      toast.success(res.message ?? t("Saved."));
      setRejecting(false);
      router.refresh();
    });
  }

  const canApprove = r.status !== "approved";
  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{r.name}</span>
        <Badge tone={TONE[r.status]}>{t(LABEL[r.status])}</Badge>
        <span className="text-sm text-muted-foreground">
          {r.email}
          {r.schoolName ? ` · ${r.schoolName}` : ""}
        </span>
      </div>
      <div className="text-sm text-muted-foreground">
        {t("Asked on {0}", formatDateTime(r.requestedAt))}
        {r.note && <span className="block text-foreground">“{r.note}”</span>}
        {(r.status === "approved" || r.status === "expired") && (
          <span className="block">
            {t("Token {0} · until {1} · {2} AI tokens per day", r.tokenName ?? "-", formatDateTime(r.expiresAt), (r.quota ?? 0).toLocaleString("id-ID"))}
          </span>
        )}
        {r.status === "rejected" && r.reason && <span className="block">{t("Reason: {0}", r.reason)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canApprove && (
          <>
            <Select aria-label={t("Demo length")} className="w-auto" value={days} onChange={(e) => setDays(e.target.value)}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {t("{0} days", d)}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={() => run(() => approveAiDemo({ userId: r.userId, days: Number(days) }))} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Check />} {r.status === "pending" ? t("Approve") : t("Give demo again")}
            </Button>
          </>
        )}
        {r.status === "pending" &&
          (rejecting ? (
            <>
              <Input className="w-56" placeholder={t("Reason (optional)")} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
              <Button size="sm" variant="outline" onClick={() => run(() => rejectAiDemo({ userId: r.userId, reason }))} disabled={busy}>
                <X /> {t("Reject")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
              <X /> {t("Reject")}
            </Button>
          ))}
        {r.status === "approved" && (
          <Button size="sm" variant="outline" onClick={() => run(() => revokeAiDemo({ userId: r.userId }))} disabled={busy}>
            <Ban /> {t("End demo now")}
          </Button>
        )}
      </div>
    </li>
  );
}
