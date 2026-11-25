import { and, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { translate, type Translate } from "@/i18n";
import { getT } from "@/i18n/server";
import { clearTeacherDemoAi, setTeacherDemoAi } from "./ai-config";
import { sendEmail } from "./email";
import { decryptSecret, encryptSecret } from "./secret-box";

/**
 * AI demo access: a teacher without their own API key asks the Super Admin for a trial of the Super Admin's
 * private Claude API (an OpenAI-compatible server, e.g. https://api.musicclass.tech). On approval the server creates a
 * demo token there (limited days, daily quota from its calculator) and puts it in the teacher's OpenAI-compatible AI
 * settings, so the teacher has nothing to copy.
 *
 * Stored in app_setting (no migration needed):
 *   "ai-demo"              the connection: API address + LMS key (encrypted) + default days + model
 *   "ai-demo:req:<userId>" one teacher's request (the demo token itself is kept encrypted, to clear it later)
 */

const CONFIG_KEY = "ai-demo";
const REQ_PREFIX = "ai-demo:req:";
const reqKey = (userId: string) => REQ_PREFIX + userId;
const API_TIMEOUT_MS = 20_000;
export const DEMO_MAX_DAYS = 30;
const DEFAULT_DAYS = 14;
const DEFAULT_MODEL = "sonnet";

/** A message for the user (English; translated where it is shown). */
export class DemoError extends Error {}

/* ------------------------------------------------------------------ */
/* Connection settings (Super Admin)                                   */
/* ------------------------------------------------------------------ */

type StoredConfig = { enabled?: boolean; baseUrl?: string; keyEnc?: string; days?: number; model?: string };
export type DemoConfig = { enabled: boolean; baseUrl: string; key: string; days: number; model: string };
export type DemoConfigView = { enabled: boolean; baseUrl: string; keySet: boolean; keyHint: string; keyUnreadable: boolean; days: number; model: string };

async function readSetting<T>(key: string): Promise<T | null> {
  const [row] = await db.select({ value: schema.appSetting.value }).from(schema.appSetting).where(eq(schema.appSetting.key, key)).limit(1);
  return (row?.value as T | undefined) ?? null;
}

async function writeSetting(key: string, value: object, by: string) {
  const v = Object.fromEntries(Object.entries(value).filter(([, x]) => x !== undefined)) as Record<string, unknown>;
  await db
    .insert(schema.appSetting)
    .values({ key, value: v, updatedBy: by })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value: v, updatedAt: new Date(), updatedBy: by } });
}

export async function getDemoConfig(): Promise<DemoConfig> {
  const s = (await readSetting<StoredConfig>(CONFIG_KEY)) ?? {};
  const key = decryptSecret(s.keyEnc) ?? "";
  return {
    enabled: Boolean(s.enabled && s.baseUrl && key),
    baseUrl: s.baseUrl ?? "",
    key,
    days: s.days ?? DEFAULT_DAYS,
    model: s.model || DEFAULT_MODEL,
  };
}

export async function getDemoConfigView(): Promise<DemoConfigView> {
  const s = (await readSetting<StoredConfig>(CONFIG_KEY)) ?? {};
  const key = decryptSecret(s.keyEnc);
  return {
    enabled: Boolean(s.enabled),
    baseUrl: s.baseUrl ?? "",
    keySet: Boolean(key),
    keyHint: key && key.length >= 12 ? `…${key.slice(-4)}` : "",
    keyUnreadable: Boolean(s.keyEnc) && key === null,
    days: s.days ?? DEFAULT_DAYS,
    model: s.model || DEFAULT_MODEL,
  };
}

/** `key` empty = keep the saved key. */
export async function saveDemoConfig(input: { enabled: boolean; baseUrl: string; key: string; days: number; model: string }, by: string) {
  const cur = (await readSetting<StoredConfig>(CONFIG_KEY)) ?? {};
  await writeSetting(
    CONFIG_KEY,
    {
      enabled: input.enabled,
      baseUrl: input.baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, ""),
      keyEnc: input.key ? encryptSecret(input.key.trim()) : cur.keyEnc,
      days: input.days,
      model: input.model,
    },
    by,
  );
}

/* ------------------------------------------------------------------ */
/* The demo API (claude-api server, /lms/demo/…)                       */
/* ------------------------------------------------------------------ */

export type DemoToken = { nama: string; kedaluwarsa: number | null; kuota: number | null; periode: string; terpakai: number; reset: number | null; status: "aktif" | "kedaluwarsa" | "kuota_habis" };
export type DemoAdvice = { kuota: number; guru: number; kapasitas_mingguan: number; sumber: "kalibrasi" | "manual" | "perkiraan"; maks_hari: number; model: string[] };

async function callApi<T>(cfg: Pick<DemoConfig, "baseUrl" | "key">, method: "GET" | "POST" | "DELETE", path: string, body?: object): Promise<T> {
  if (!cfg.baseUrl || !cfg.key) throw new DemoError("The AI demo is not set up. Add the demo API address and LMS key first.");
  let url: URL;
  try {
    url = new URL(cfg.baseUrl.replace(/\/+$/, "") + "/lms/demo" + path);
  } catch {
    throw new DemoError("The demo API address is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new DemoError("The demo API address must start with https://.");
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${cfg.key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[ai-demo] connection", e);
    throw new DemoError("Could not reach the demo API. Check the address and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown } & T;
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "";
    console.error("[ai-demo] api error", res.status, detail);
    if (res.status === 401) throw new DemoError("The LMS key was refused by the demo API (wrong or revoked). Create a new LMS key in the token panel.");
    if (res.status === 404 && method !== "POST") throw new DemoError("The demo token no longer exists on the demo API.");
    if (res.status === 429) throw new DemoError("Too many demo tokens were created in the last 24 hours. Try again tomorrow.");
    throw new DemoError(detail ? `The demo API refused: ${detail}` : "The demo API could not handle the request.");
  }
  return data as T;
}

/** The daily quota the demo API would give a new teacher now (also tests the connection). */
export async function demoAdvice(cfg?: DemoConfig): Promise<DemoAdvice> {
  return callApi<DemoAdvice>(cfg ?? (await getDemoConfig()), "GET", "/saran");
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export type DemoStatus = "pending" | "approved" | "rejected" | "revoked";
type StoredRequest = {
  status: DemoStatus;
  note?: string;
  requestedAt: string;
  decidedAt?: string;
  reason?: string;
  tokenName?: string;
  tokenEnc?: string;
  expiresAt?: string;
  quota?: number;
  days?: number;
};
/** A request as the pages see it ("expired" = approved but past its end). Never contains the token. */
export type DemoRequest = Omit<StoredRequest, "tokenEnc" | "status"> & { status: DemoStatus | "expired"; userId: string };
export type DemoRequestRow = DemoRequest & { name: string; email: string; schoolName: string | null };

const view = (userId: string, r: StoredRequest): DemoRequest => {
  const { tokenEnc: _hidden, ...rest } = r;
  const expired = r.status === "approved" && r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now();
  return { ...rest, userId, status: expired ? "expired" : r.status };
};

export async function getDemoRequest(userId: string): Promise<DemoRequest | null> {
  const r = await readSetting<StoredRequest>(reqKey(userId));
  return r ? view(userId, r) : null;
}

export async function listDemoRequests(): Promise<DemoRequestRow[]> {
  const rows = await db
    .select({ key: schema.appSetting.key, value: schema.appSetting.value, name: schema.user.name, email: schema.user.email, schoolName: schema.user.schoolName })
    .from(schema.appSetting)
    // user.id = the part of app_setting.key after the prefix
    .innerJoin(schema.user, sql`${schema.user.id} = substring(${schema.appSetting.key} from ${sql.raw(String(REQ_PREFIX.length + 1))})`)
    .where(like(schema.appSetting.key, `${REQ_PREFIX}%`));
  const order: Record<DemoRequest["status"], number> = { pending: 0, approved: 1, expired: 2, rejected: 3, revoked: 4 };
  return rows
    .map((r) => ({ ...view(r.key.slice(REQ_PREFIX.length), r.value as unknown as StoredRequest), name: r.name, email: r.email, schoolName: r.schoolName }))
    .sort((a, b) => order[a.status] - order[b.status] || b.requestedAt.localeCompare(a.requestedAt));
}

async function adminEmail(): Promise<string | null> {
  const [a] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.isAdmin, true)).limit(1);
  return a?.email ?? null;
}

async function teacher(userId: string) {
  const [u] = await db
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
    .from(schema.user)
    .where(and(eq(schema.user.id, userId), eq(schema.user.role, "teacher"), eq(schema.user.isAdmin, false)))
    .limit(1);
  return u ?? null;
}

/** The request's translator; plain English outside a request (scripts, tests). */
async function translator(): Promise<Translate> {
  try {
    return await getT();
  } catch {
    return (key, ...args) => translate({}, key, args);
  }
}

const appUrl = () => (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");

/** A teacher asks for demo access. */
export async function createDemoRequest(userId: string, note: string): Promise<void> {
  const cfg = await getDemoConfig();
  if (!cfg.enabled) throw new DemoError("The AI demo is not available on this server.");
  const cur = await getDemoRequest(userId);
  if (cur?.status === "pending") throw new DemoError("Your request is already waiting for the admin.");
  if (cur?.status === "approved") throw new DemoError("Your AI demo is already active.");
  const me = await teacher(userId);
  if (!me) throw new DemoError("Only teachers can ask for the AI demo.");
  // Keep the previous demo token's name & key (an expired or revoked demo): approving again revokes it first.
  const prev = await readSetting<StoredRequest>(reqKey(userId));
  await writeSetting(
    reqKey(userId),
    { status: "pending", note: note.trim().slice(0, 500) || undefined, requestedAt: new Date().toISOString(), tokenName: prev?.tokenName, tokenEnc: prev?.tokenEnc } satisfies StoredRequest,
    userId,
  );

  const to = await adminEmail();
  if (to) {
    const t = await translator();
    await sendEmail({
      to,
      subject: t("AI demo request from {0}", me.name),
      text: t("{0} ({1}) asks for access to the AI demo.\n\nNote: {2}\n\nApprove or reject it here:\n{3}", me.name, me.email, note.trim() || "-", `${appUrl()}/teacher/admin/ai-demo`),
    }).catch((e) => console.error("[ai-demo] email to admin", e));
  }
}

/** The teacher takes back a request that is still waiting. */
export async function cancelDemoRequest(userId: string): Promise<void> {
  const cur = await readSetting<StoredRequest>(reqKey(userId));
  if (cur?.status !== "pending") throw new DemoError("There is no waiting request to cancel.");
  await db.delete(schema.appSetting).where(eq(schema.appSetting.key, reqKey(userId)));
}

/** Approve: create the demo token on the API and put it in the teacher's AI settings. */
export async function approveDemoRequest(userId: string, days: number, adminId: string): Promise<DemoToken> {
  const cfg = await getDemoConfig();
  if (!cfg.enabled) throw new DemoError("Turn the AI demo on and save the connection first.");
  const cur = await readSetting<StoredRequest>(reqKey(userId));
  if (!cur) throw new DemoError("This teacher has not asked for the AI demo.");
  if (view(userId, cur).status === "approved") throw new DemoError("This teacher's AI demo is already active.");
  const who = await teacher(userId);
  if (!who) throw new DemoError("That teacher no longer exists.");

  // A previous demo token (renewal): revoke it first, so one teacher has one token.
  if (cur.tokenName) await callApi(cfg, "DELETE", `/tokens/${encodeURIComponent(cur.tokenName)}`).catch(() => undefined);
  const oldKey = decryptSecret(cur.tokenEnc);
  if (oldKey) await clearTeacherDemoAi(userId, oldKey, adminId);

  const made = await callApi<DemoToken & { token: string }>(cfg, "POST", "/tokens", { nama: who.name, hari: days, catatan: who.email });
  await setTeacherDemoAi(userId, { baseUrl: `${cfg.baseUrl}/v1`, key: made.token, model: cfg.model }, adminId);
  const expiresAt = made.kedaluwarsa ? new Date(made.kedaluwarsa * 1000).toISOString() : undefined;
  await writeSetting(
    reqKey(userId),
    { ...cur, status: "approved", decidedAt: new Date().toISOString(), reason: undefined, tokenName: made.nama, tokenEnc: encryptSecret(made.token), expiresAt, quota: made.kuota ?? undefined, days } satisfies StoredRequest,
    adminId,
  );

  const t = await translator();
  await sendEmail({
    to: who.email,
    subject: t("Your AI demo is active"),
    text: t(
      "Hello {0},\n\nYour AI demo access was approved. It is already set up in your AI Settings, so the AI features work right away.\n\nValid until: {1}\nDaily allowance: {2} AI tokens\n\n{3}",
      who.name,
      expiresAt ? new Date(expiresAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-",
      made.kuota ?? "-",
      `${appUrl()}/teacher/ai-settings`,
    ),
  }).catch((e) => console.error("[ai-demo] email to teacher", e));
  return made;
}

export async function rejectDemoRequest(userId: string, reason: string, adminId: string): Promise<void> {
  const cur = await readSetting<StoredRequest>(reqKey(userId));
  if (cur?.status !== "pending") throw new DemoError("This request is not waiting for approval.");
  await writeSetting(reqKey(userId), { ...cur, status: "rejected", decidedAt: new Date().toISOString(), reason: reason.trim().slice(0, 300) || undefined } satisfies StoredRequest, adminId);
  const who = await teacher(userId);
  if (who) {
    const t = await translator();
    await sendEmail({
      to: who.email,
      subject: t("Your AI demo request"),
      text: t("Hello {0},\n\nYour AI demo request was not approved.\n\nReason: {1}", who.name, reason.trim() || "-"),
    }).catch((e) => console.error("[ai-demo] email to teacher", e));
  }
}

/** End an approved demo now: revoke the token on the API and remove it from the teacher's AI settings. */
export async function revokeDemo(userId: string, adminId: string): Promise<void> {
  const cur = await readSetting<StoredRequest>(reqKey(userId));
  if (!cur || cur.status !== "approved" || !cur.tokenName) throw new DemoError("This teacher has no active AI demo.");
  const cfg = await getDemoConfig();
  try {
    await callApi(cfg, "DELETE", `/tokens/${encodeURIComponent(cur.tokenName)}`);
  } catch (e) {
    // Already gone on the API (expired and removed, or revoked in the panel): still clean up here.
    if (!(e instanceof DemoError && e.message.startsWith("The demo token no longer exists"))) throw e;
  }
  const key = decryptSecret(cur.tokenEnc);
  if (key) await clearTeacherDemoAi(userId, key, adminId);
  await writeSetting(reqKey(userId), { ...cur, status: "revoked", decidedAt: new Date().toISOString(), tokenEnc: undefined } satisfies StoredRequest, adminId);
}

/** Live usage of a teacher's demo token (null when it cannot be read right now). */
export async function demoUsage(req: DemoRequest | null): Promise<DemoToken | null> {
  if (!req?.tokenName || (req.status !== "approved" && req.status !== "expired")) return null;
  try {
    return await callApi<DemoToken>(await getDemoConfig(), "GET", `/tokens/${encodeURIComponent(req.tokenName)}`);
  } catch {
    return null;
  }
}
