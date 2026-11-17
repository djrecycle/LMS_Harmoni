import { and, desc, eq, gt, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * What every AI request used, and what is left of a provider's free allowance where that can be known.
 *
 * Token counts come from the providers' own answers. "Left today" is only partly knowable:
 *  - Groq (and some other OpenAI-compatible services) report their rate limits in every answer;
 *  - OpenRouter reports credits through its /key endpoint;
 *  - Cloudflare counts its free 10,000 neurons/day in neurons, estimated here from the tokens;
 *  - Gemini reports nothing, so the app counts its own requests against a limit the teacher enters;
 *  - Anthropic has no free tier: an estimated cost is shown instead (Claude Code reports its own).
 * Counts made by the app miss any use of the same key outside the app.
 */

export type RateLimits = { requestsLimit?: number; requestsRemaining?: number; tokensLimit?: number; tokensRemaining?: number };

/** What one runner reports about the request it made. */
export type CallUsage = {
  model: string;
  input: number;
  output: number;
  /** Tokens written to / read from a prompt cache (Anthropic), already excluded from `input`. */
  cacheWrite?: number;
  cacheRead?: number;
  costUsd?: number | null;
  limits?: RateLimits | null;
  host?: string | null;
  /** Picture requests: Cloudflare FLUX steps, for the neuron estimate. */
  steps?: number;
};

export type UsageProvider = "claude-cli" | "anthropic" | "gemini" | "cloudflare" | "openai" | "ollama";

/* ------------------------------------------------------------------ */
/* Prices and allowances                                               */
/* ------------------------------------------------------------------ */

/** Anthropic API list prices, USD per million tokens (input, output). Cache writes cost 1.25× input, reads ~0.1×. */
const ANTHROPIC_PRICES: [RegExp, number, number][] = [
  [/fable-5-2|mythos-5-2/, 8, 40],
  [/fable-5|mythos-5/, 10, 50],
  [/opus-5-5/, 4, 20],
  [/opus-(5|4-[5-9])/, 5, 25],
  [/sonnet-5/, 2, 10],
  [/sonnet-4/, 3, 15],
  [/haiku-5-5/, 0.1, 0.5],
  [/haiku-4/, 1, 5],
];

export function anthropicCost(u: CallUsage): number | null {
  const price = ANTHROPIC_PRICES.find(([re]) => re.test(u.model));
  if (!price) return null;
  const [, inp, out] = price;
  return ((u.input + (u.cacheWrite ?? 0) * 1.25 + (u.cacheRead ?? 0) * 0.1) * inp + u.output * out) / 1_000_000;
}

/** Cloudflare Workers AI: the free allowance per day (reset at 00:00 UTC). */
export const CLOUDFLARE_FREE_NEURONS = 10_000;
/** Neurons per million tokens (input, output) for the text models whose rate is known. */
const CLOUDFLARE_TEXT_RATES: [RegExp, number, number][] = [[/llama-3\.3-70b-instruct-fp8-fast/, 26_668, 204_805]];
/** FLUX.1 schnell: neurons per 512×512 tile and per step; its pictures are 1024×1024 (4 tiles). */
const FLUX_TILE = 4.8;
const FLUX_STEP = 9.6;
const FLUX_TILES = 4;

/** Estimated neurons, or null when the model's rate is not known. */
export function cloudflareNeurons(kind: "text" | "image", u: CallUsage): number | null {
  if (kind === "image") return /flux-1-schnell/.test(u.model) ? FLUX_TILES * FLUX_TILE + (u.steps ?? 4) * FLUX_STEP : null;
  const rate = CLOUDFLARE_TEXT_RATES.find(([re]) => re.test(u.model));
  return rate ? (u.input * rate[1] + u.output * rate[2]) / 1_000_000 : null;
}

/** OpenRouter: free (":free") models allow 50 requests a day, or 1,000 once the account bought at least $10 of credits. */
const OPENROUTER_FREE_SMALL = 50;
const OPENROUTER_FREE_LARGE = 1000;

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

const KEEP_DAYS = 90;
let lastPrune = 0;

/** Save one request. Never throws: usage notes must not break the AI feature itself. */
export async function recordAiCall(userId: string, provider: UsageProvider, kind: "text" | "image", u: CallUsage): Promise<void> {
  try {
    const costUsd = u.costUsd ?? (provider === "anthropic" ? anthropicCost(u) : null);
    const neurons = provider === "cloudflare" ? cloudflareNeurons(kind, u) : null;
    await db.insert(schema.aiCall).values({
      userId,
      provider,
      kind,
      model: u.model.slice(0, 200),
      inputTokens: Math.round(u.input + (u.cacheWrite ?? 0) + (u.cacheRead ?? 0)),
      outputTokens: Math.round(u.output),
      costUsd,
      neurons,
      limits: u.limits ?? null,
      host: u.host ?? null,
    });
    if (Date.now() - lastPrune > 6 * 3_600_000) {
      lastPrune = Date.now();
      await db.delete(schema.aiCall).where(lt(schema.aiCall.createdAt, new Date(Date.now() - KEEP_DAYS * 86_400_000)));
    }
  } catch (e) {
    console.warn("[ai-usage] could not record an AI call:", e instanceof Error ? e.message : e);
  }
}

/* ------------------------------------------------------------------ */
/* Time windows                                                        */
/* ------------------------------------------------------------------ */

/** The start of the current day in a time zone, as an instant. */
export function startOfDayIn(timeZone: string, now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000; // the zone's offset from UTC right now
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}

/** When each provider's daily allowance starts again. */
const RESET_ZONE: Partial<Record<UsageProvider, string>> = { cloudflare: "UTC", gemini: "America/Los_Angeles" };
const APP_ZONE = "Asia/Jakarta";

/** The reset time written in WIB, e.g. "07.00 WIB". */
function resetInWib(zone: string): string {
  const next = new Date(startOfDayIn(zone).getTime() + 86_400_000);
  return `${new Intl.DateTimeFormat("id-ID", { timeZone: APP_ZONE, hour: "2-digit", minute: "2-digit" }).format(next)} WIB`;
}

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

const C = schema.aiCall;

export type ProviderUsage = {
  provider: UsageProvider;
  /** A sub-service of the OpenAI-compatible provider (its host), or null. */
  host: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  /** The free-allowance line, when something can be said about it. */
  allowance: Allowance | null;
};

/**
 * What is known about a provider's free allowance:
 *  - "used": `used` of `limit` (estimated or counted by the app; `limit` null = no limit known);
 *  - "reported": the service itself says how much is left.
 */
export type Allowance = {
  kind: "used" | "reported";
  /** What is counted: "requests", "neurons", "credits" (USD) or "tokens". */
  unit: "requests" | "neurons" | "credits" | "tokens";
  used?: number;
  limit?: number | null;
  remaining?: number;
  /** "day" (requests), "minute" (Groq tokens), or none. */
  per?: "day" | "minute";
  resetAt?: string;
  estimated?: boolean;
  /** Short extra notes, as i18n keys with arguments. */
  notes?: { key: string; args?: (string | number)[] }[];
};

type Totals = { requests: number; inputTokens: number; outputTokens: number; costUsd: number | null; neurons: number | null };

async function totals(userId: string, since: Date, where?: ReturnType<typeof and>): Promise<Totals> {
  const [r] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${C.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${C.outputTokens}), 0)::int`,
      costUsd: sql<number | null>`sum(${C.costUsd})`,
      neurons: sql<number | null>`sum(${C.neurons})`,
    })
    .from(C)
    .where(and(eq(C.userId, userId), gte(C.createdAt, since), where));
  return { requests: r?.requests ?? 0, inputTokens: r?.inputTokens ?? 0, outputTokens: r?.outputTokens ?? 0, costUsd: r?.costUsd ?? null, neurons: r?.neurons ?? null };
}

const isOpenRouter = (host: string | null) => host === "openrouter.ai";
const isGroq = (host: string | null) => host === "api.groq.com";

/** OpenRouter's /key answer (credits), remembered for a few minutes per key. */
const openRouterCache = new Map<string, { at: number; info: { usage?: number; limit?: number | null; remaining?: number | null; freeTier?: boolean } | null }>();
async function openRouterKeyInfo(key: string) {
  const hit = openRouterCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.info;
  let info: { usage?: number; limit?: number | null; remaining?: number | null; freeTier?: boolean } | null = null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = ((await res.json()) as { data?: { usage?: number; limit?: number | null; limit_remaining?: number | null; is_free_tier?: boolean } }).data;
      if (d) info = { usage: d.usage, limit: d.limit, remaining: d.limit_remaining, freeTier: d.is_free_tier };
    }
  } catch {
    /* no credit info: the counted requests are still shown */
  }
  openRouterCache.set(key, { at: Date.now(), info });
  return info;
}

/** The settings the allowance lines need (passed in, so this module does not read keys itself). */
export type AllowanceSettings = { geminiFreeRpd: number | null; openai: { baseUrl: string; key: string } };

async function allowanceFor(userId: string, provider: UsageProvider, host: string | null, s: AllowanceSettings): Promise<Allowance | null> {
  if (provider === "cloudflare") {
    const since = startOfDayIn("UTC");
    const t = await totals(userId, since, eq(C.provider, "cloudflare"));
    const [unknown] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(C)
      .where(and(eq(C.userId, userId), eq(C.provider, "cloudflare"), gte(C.createdAt, since), sql`${C.neurons} is null`));
    return {
      kind: "used",
      unit: "neurons",
      used: Math.round(t.neurons ?? 0),
      limit: CLOUDFLARE_FREE_NEURONS,
      resetAt: resetInWib("UTC"),
      estimated: true,
      notes: (unknown?.n ?? 0) > 0 ? [{ key: "{0} request(s) used a model whose neuron rate is unknown and are not counted. The exact figure is in the Cloudflare dashboard.", args: [unknown.n] }] : undefined,
    };
  }
  if (provider === "gemini") {
    const since = startOfDayIn("America/Los_Angeles");
    const t = await totals(userId, since, and(eq(C.provider, "gemini"), eq(C.kind, "text")));
    return {
      kind: "used",
      unit: "requests",
      used: t.requests,
      limit: s.geminiFreeRpd,
      per: "day",
      resetAt: resetInWib("America/Los_Angeles"),
      notes: [{ key: "Counted by this app: Google does not report how much is left." }],
    };
  }
  if (provider === "openai" && isGroq(host)) {
    const [last] = await db
      .select({ limits: C.limits })
      .from(C)
      .where(and(eq(C.userId, userId), eq(C.provider, "openai"), eq(C.host, host!), gte(C.createdAt, startOfDayIn("UTC")), sql`${C.limits} is not null`))
      .orderBy(desc(C.createdAt))
      .limit(1);
    const l = last?.limits;
    if (!l || l.requestsRemaining === undefined) return null;
    return {
      kind: "reported",
      unit: "requests",
      remaining: l.requestsRemaining,
      limit: l.requestsLimit ?? null,
      per: "day",
      notes: l.tokensRemaining !== undefined ? [{ key: "Tokens this minute: {0} of {1} left.", args: [l.tokensRemaining, l.tokensLimit ?? "?"] }] : undefined,
    };
  }
  if (provider === "openai" && isOpenRouter(host) && s.openai.key && isOpenRouter(hostOf(s.openai.baseUrl))) {
    const since = startOfDayIn("UTC");
    const free = await totals(userId, since, and(eq(C.provider, "openai"), eq(C.host, host!), sql`${C.model} like '%:free'`));
    const info = await openRouterKeyInfo(s.openai.key);
    const notes: Allowance["notes"] = [];
    if (info?.limit != null && info.remaining != null) notes.push({ key: "Credits: ${0} of ${1} left.", args: [info.remaining.toFixed(2), info.limit.toFixed(2)] });
    else if (info?.usage != null) notes.push({ key: "Credits used so far: ${0}.", args: [info.usage.toFixed(2)] });
    notes.push({ key: "Free models allow {0} requests a day, or {1} once the account has bought at least $10 of credits.", args: [OPENROUTER_FREE_SMALL, OPENROUTER_FREE_LARGE] });
    return {
      kind: "used",
      unit: "requests",
      used: free.requests,
      limit: info?.freeTier ? OPENROUTER_FREE_SMALL : null,
      per: "day",
      resetAt: resetInWib("UTC"),
      notes,
    };
  }
  if (provider === "openai") {
    // Another service: show what it reported, if anything.
    const [last] = await db
      .select({ limits: C.limits })
      .from(C)
      .where(and(eq(C.userId, userId), eq(C.provider, "openai"), host ? eq(C.host, host) : sql`true`, gte(C.createdAt, startOfDayIn(APP_ZONE)), sql`${C.limits} is not null`))
      .orderBy(desc(C.createdAt))
      .limit(1);
    const l = last?.limits;
    if (l?.requestsRemaining !== undefined) return { kind: "reported", unit: "requests", remaining: l.requestsRemaining, limit: l.requestsLimit ?? null };
    return null;
  }
  return null;
}

export const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/** Today's usage (WIB day) per provider for one teacher, with the free-allowance line for each. */
export async function usageToday(userId: string, s: AllowanceSettings): Promise<ProviderUsage[]> {
  const rows = await db
    .select({
      provider: C.provider,
      host: C.host,
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${C.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${C.outputTokens}), 0)::int`,
      costUsd: sql<number | null>`sum(${C.costUsd})`,
    })
    .from(C)
    .where(and(eq(C.userId, userId), gte(C.createdAt, startOfDayIn(APP_ZONE))))
    .groupBy(C.provider, C.host);
  const list = rows.map((r) => ({ ...r, provider: r.provider as UsageProvider, host: r.provider === "openai" ? r.host : null }));
  return Promise.all(list.map(async (r) => ({ ...r, allowance: await allowanceFor(userId, r.provider, r.host, s) })));
}

/** The allowance line for one provider (also without any request today, for the settings card). */
export const allowanceLine = allowanceFor;

/* ------------------------------------------------------------------ */
/* Notices after each use                                              */
/* ------------------------------------------------------------------ */

export type RecentUsage = {
  /** Newest createdAt seen (ISO), to ask for what came after it next time. */
  cursor: string;
  calls: { provider: UsageProvider; host: string | null; model: string; kind: string; inputTokens: number; outputTokens: number; costUsd: number | null }[];
};

/** Calls after `after` (at most 50). Without `after`: no calls, only a cursor to start from. */
export async function recentCalls(userId: string, after: Date | null): Promise<RecentUsage> {
  if (!after) {
    const [last] = await db.select({ at: C.createdAt }).from(C).where(eq(C.userId, userId)).orderBy(desc(C.createdAt)).limit(1);
    return { cursor: (last?.at ?? new Date()).toISOString(), calls: [] };
  }
  const rows = await db
    .select({ provider: C.provider, host: C.host, model: C.model, kind: C.kind, inputTokens: C.inputTokens, outputTokens: C.outputTokens, costUsd: C.costUsd, at: C.createdAt })
    .from(C)
    .where(and(eq(C.userId, userId), gt(C.createdAt, after)))
    .orderBy(C.createdAt)
    .limit(50);
  return {
    cursor: (rows.at(-1)?.at ?? after).toISOString(),
    calls: rows.map(({ at: _at, ...r }) => ({ ...r, provider: r.provider as UsageProvider })),
  };
}

/* ------------------------------------------------------------------ */
/* Super Admin: every teacher today                                    */
/* ------------------------------------------------------------------ */

export async function usageTodayAllTeachers() {
  return db
    .select({
      userId: C.userId,
      name: schema.user.name,
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${C.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${C.outputTokens}), 0)::int`,
      costUsd: sql<number | null>`sum(${C.costUsd})`,
      providers: sql<string[]>`array_agg(distinct ${C.provider})`,
    })
    .from(C)
    .innerJoin(schema.user, eq(schema.user.id, C.userId))
    .where(gte(C.createdAt, startOfDayIn(APP_ZONE)))
    .groupBy(C.userId, schema.user.name)
    .orderBy(desc(sql`count(*)`));
}
