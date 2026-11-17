import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai-config";
import { allowanceLine, recentCalls, type Allowance, type UsageProvider } from "@/lib/ai-usage";
import { getCurrentUser, isActiveTeacher } from "@/lib/session";

export const runtime = "nodejs";

export type RecentUsageResponse = {
  cursor: string;
  /** The new requests since `after`, grouped by provider, service and model. */
  groups: { provider: UsageProvider; host: string | null; model: string; kind: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number | null; allowance: Allowance | null }[];
};

/**
 * The AI requests of the signed-in teacher after `?after=<ISO time>`, for the notice shown after each AI use.
 * Without `after` it only returns a cursor to start from. Never returns keys or prompts.
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isActiveTeacher(me)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const raw = new URL(req.url).searchParams.get("after");
  const after = raw ? new Date(raw) : null;
  if (after && Number.isNaN(after.getTime())) return NextResponse.json({ error: "Bad cursor" }, { status: 400 });

  const recent = await recentCalls(me.id, after);
  const byKey = new Map<string, RecentUsageResponse["groups"][number]>();
  for (const c of recent.calls) {
    const key = `${c.provider}|${c.host ?? ""}|${c.model}|${c.kind}`;
    const g = byKey.get(key) ?? { provider: c.provider, host: c.host, model: c.model, kind: c.kind, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: null, allowance: null };
    g.requests++;
    g.inputTokens += c.inputTokens;
    g.outputTokens += c.outputTokens;
    if (c.costUsd != null) g.costUsd = (g.costUsd ?? 0) + c.costUsd;
    byKey.set(key, g);
  }
  const groups = [...byKey.values()];
  if (groups.length) {
    const cfg = await getAiConfig(me.id);
    const settings = { geminiFreeRpd: cfg.gemini.freeRpd, openai: { baseUrl: cfg.openai.baseUrl, key: cfg.openai.key } };
    await Promise.all(groups.map(async (g) => (g.allowance = await allowanceLine(me.id, g.provider, g.host, settings))));
  }
  return NextResponse.json({ cursor: recent.cursor, groups } satisfies RecentUsageResponse, { headers: { "Cache-Control": "no-store" } });
}
