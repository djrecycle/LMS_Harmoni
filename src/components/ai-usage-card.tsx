import { Activity } from "lucide-react";
import { UsageNoticeToggle } from "@/components/ai-usage-notifier";
import { Badge } from "@/components/ui/misc";
import { getAiConfig } from "@/lib/ai-config";
import { allowanceLine, hostOf, usageToday, usageTodayAllTeachers, type ProviderUsage, type UsageProvider } from "@/lib/ai-usage";
import { allowanceNotes, allowanceText, formatNumber, formatUsd, providerName, tokenLine } from "@/lib/ai-usage-format";
import { getLocale, getT } from "@/i18n/server";

/**
 * "AI usage today" on the AI Settings page: requests and tokens per provider (WIB day), what is left of each free
 * allowance where that can be known, and for the Super Admin every teacher's total.
 */
export async function AiUsageCard({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [t, locale, cfg] = await Promise.all([getT(), getLocale(), getAiConfig(userId)]);
  const settings = { geminiFreeRpd: cfg.gemini.freeRpd, openai: { baseUrl: cfg.openai.baseUrl, key: cfg.openai.key } };
  const used = await usageToday(userId, settings);

  // Providers that are set up but unused today still show their allowance ("0 of 10,000").
  const configured: { provider: UsageProvider; host: string | null }[] = [];
  if (cfg.gemini.key) configured.push({ provider: "gemini", host: null });
  if (cfg.cloudflare.accountId && cfg.cloudflare.token) configured.push({ provider: "cloudflare", host: null });
  if (cfg.openai.baseUrl && cfg.openai.model) configured.push({ provider: "openai", host: hostOf(cfg.openai.baseUrl) });
  const rows: ProviderUsage[] = [...used];
  for (const c of configured) {
    if (rows.some((r) => r.provider === c.provider && (c.provider !== "openai" || r.host === c.host))) continue;
    const allowance = await allowanceLine(userId, c.provider, c.host, settings);
    if (allowance) rows.push({ ...c, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: null, allowance });
  }

  const everyone = isAdmin ? await usageTodayAllTeachers() : [];

  return (
    <section className="mb-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Activity className="size-5 text-primary" aria-hidden /> {t("AI usage today")}
        </h2>
        <UsageNoticeToggle />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("No AI requests yet today.")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={`${r.provider}|${r.host ?? ""}`} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{providerName(r.provider, r.host)}</span>
                <Badge>{t("{0} requests", formatNumber(r.requests, locale))}</Badge>
              </div>
              {r.requests > 0 && (
                <p className="mt-1 text-muted-foreground">
                  {tokenLine(t, locale, r.inputTokens, r.outputTokens)}
                  {r.costUsd != null && ` · ≈ ${formatUsd(r.costUsd, locale)}`}
                </p>
              )}
              {r.allowance && (
                <>
                  <p className="mt-1 font-semibold">{allowanceText(r.allowance, t, locale)}</p>
                  {r.allowance.limit != null && r.allowance.kind === "used" && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className={`h-full rounded-full ${(r.allowance.used ?? 0) >= r.allowance.limit ? "bg-danger" : (r.allowance.used ?? 0) >= r.allowance.limit * 0.8 ? "bg-accent" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, ((r.allowance.used ?? 0) / Math.max(1, r.allowance.limit)) * 100)}%` }}
                      />
                    </div>
                  )}
                  {allowanceNotes(r.allowance, t, locale).map((n) => (
                    <p key={n} className="mt-1 text-xs text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </>
              )}
              {!r.allowance && r.provider === "gemini" && <p className="mt-1 text-xs text-muted-foreground">{t("Fill in the free requests per day under Gemini API to see what is left.")}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {t("Counted per WIB day. Tokens come from the providers' own answers; “≈” marks an estimate. Use of the same key outside this app is not counted, except where the service reports it itself.")}
      </p>

      {isAdmin && (
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-2 font-bold">{t("All teachers today")}</h3>
          {everyone.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No AI requests yet today.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-semibold">{t("Teacher")}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t("Requests")}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t("Tokens in")}</th>
                    <th className="py-1 pr-3 text-right font-semibold">{t("Tokens out")}</th>
                    <th className="py-1 font-semibold">{t("Providers")}</th>
                  </tr>
                </thead>
                <tbody>
                  {everyone.map((e) => (
                    <tr key={e.userId} className="border-t">
                      <td className="py-1.5 pr-3">{e.name}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(e.requests, locale)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(e.inputTokens, locale)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(e.outputTokens, locale)}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{(e.providers ?? []).map((p) => providerName(p as UsageProvider, null)).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
