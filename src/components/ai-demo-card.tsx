"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cancelAiDemo, requestAiDemo } from "@/app/actions/ai-demo";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Alert, Badge, Progress } from "@/components/ui/misc";
import type { DemoRequest, DemoToken } from "@/lib/ai-demo";
import { formatDateTime } from "@/lib/utils";
import { useT } from "@/i18n/client";

const num = (n: number) => n.toLocaleString("id-ID");

/** For a teacher without their own API key: ask the Super Admin for a trial of the server's Claude AI. */
export function AiDemoCard({ request, usage }: { request: DemoRequest | null; usage: DemoToken | null }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState("");
  const status = request?.status ?? null;

  function ask() {
    start(async () => {
      const r = await requestAiDemo({ note });
      if (!r.ok) return void toast.error(r.error ?? t("Could not send the request."));
      toast.success(r.message);
      setNote("");
      router.refresh();
    });
  }

  function cancel() {
    start(async () => {
      const r = await cancelAiDemo();
      if (!r.ok) return void toast.error(r.error ?? t("Could not cancel the request."));
      toast.success(r.message);
      router.refresh();
    });
  }

  return (
    <section className="mb-6 grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h2 className="text-lg font-bold">{t("Try the AI (demo)")}</h2>
        {status === "pending" && <Badge tone="warning">{t("Waiting for approval")}</Badge>}
        {status === "approved" && <Badge tone="success">{t("Active")}</Badge>}
        {status === "expired" && <Badge>{t("Ended")}</Badge>}
      </div>

      {status === "approved" && request ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t("Your AI demo is set up below as the “OpenAI-compatible” provider. The AI features work right away; you don't need your own API key while the demo lasts.")}
          </p>
          <div className="grid gap-1 text-sm">
            <span>
              {t("Valid until")}: <b>{formatDateTime(request.expiresAt)}</b>
            </span>
            {usage?.kuota ? (
              <>
                <span>
                  {t("Used today")}: <b>{num(usage.terpakai)}</b> / {num(usage.kuota)} {t("AI tokens")}
                </span>
                <Progress value={(usage.terpakai / usage.kuota) * 100} label={t("Used today")} />
                <span className="text-xs text-muted-foreground">{t("The daily allowance starts again at 00:00 WIB.")}</span>
              </>
            ) : request.quota ? (
              <span>
                {t("Daily allowance")}: <b>{num(request.quota)}</b> {t("AI tokens")}
              </span>
            ) : null}
          </div>
          {usage?.status === "kuota_habis" && <Alert kind="warning">{t("Today's demo allowance is used up. It starts again at 00:00 WIB.")}</Alert>}
          <p className="text-xs text-muted-foreground">{t("Please don't change the OpenAI-compatible address, key or model below while the demo is active.")}</p>
        </>
      ) : status === "pending" && request ? (
        <>
          <Alert kind="info" title={t("Your request is waiting for the admin")}>
            {t("Sent on {0}. You will get an email when it is approved.", formatDateTime(request.requestedAt))}
            {request.note && (
              <span className="mt-1 block">
                {t("Your note")}: “{request.note}”
              </span>
            )}
          </Alert>
          <div>
            <Button variant="outline" onClick={cancel} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <X />} {t("Cancel request")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("No API key yet? Ask the admin for a free trial of the AI (Claude) so you can try the AI features first. The trial lasts a limited number of days with a daily allowance.")}
          </p>
          {status === "expired" && request && <Alert kind="info">{t("Your previous demo ended on {0}. You can ask again.", formatDateTime(request.expiresAt))}</Alert>}
          {status === "rejected" && request && (
            <Alert kind="warning" title={t("Your previous request was not approved")}>
              {request.reason || t("No reason given.")}
            </Alert>
          )}
          {status === "revoked" && <Alert kind="info">{t("Your previous demo was ended by the admin. You can ask again.")}</Alert>}
          <Field label={t("Note for the admin (optional)")} htmlFor="demo-note" hint={t("For example your school and what you want to try.")}>
            <Textarea id="demo-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={ask} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Send />} {t("Ask for AI demo access")}
            </Button>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> {t("The admin approves requests by hand.")}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
