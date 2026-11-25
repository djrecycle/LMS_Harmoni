"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { zodError } from "@/lib/action-result-server";
import {
  approveDemoRequest,
  cancelDemoRequest,
  createDemoRequest,
  DEMO_MAX_DAYS,
  demoAdvice,
  DemoError,
  getDemoConfig,
  rejectDemoRequest,
  revokeDemo,
  saveDemoConfig,
  type DemoAdvice,
} from "@/lib/ai-demo";
import { requireAdmin, requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

// AI demo access (see lib/ai-demo.ts). Server actions are public POST endpoints, so each one checks the role itself.

const refresh = () => {
  revalidatePath("/teacher/ai-settings");
  revalidatePath("/teacher/admin/ai-demo");
};

/** Run `fn`, turning a DemoError into a translated failure. */
async function guarded<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; result: ActionResult<never> }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof DemoError) return { ok: false, result: fail((await getT())(e.message)) };
    throw e;
  }
}

/* ---------------------------- teacher ---------------------------- */

export async function requestAiDemo(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const me = await requireTeacher();
  if (me.isAdmin) return fail(t("The Super Admin uses the server's AI settings and does not need the demo."));
  const p = z.object({ note: z.string().trim().max(500, "The note is too long (max. 500 characters)").default("") }).safeParse(data);
  if (!p.success) return zodError(p.error);
  const r = await guarded(() => createDemoRequest(me.id, p.data.note));
  if (!r.ok) return r.result;
  refresh();
  return succeed(t("Request sent. You will get an email when the admin has approved it."));
}

export async function cancelAiDemo(): Promise<ActionResult> {
  const t = await getT();
  const me = await requireTeacher();
  const r = await guarded(() => cancelDemoRequest(me.id));
  if (!r.ok) return r.result;
  refresh();
  return succeed(t("Request cancelled."));
}

/* ---------------------------- Super Admin ---------------------------- */

const configSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/[^\s/]+[^\s]*$/i.test(v), "The address must start with https:// (for example https://api.musicclass.tech)"),
  key: z.string().trim().max(200).refine((v) => v === "" || /^\S{20,}$/.test(v), "That does not look like an LMS key").default(""),
  days: z.number().int().min(1, "Between 1 and 30 days").max(DEMO_MAX_DAYS, "Between 1 and 30 days"),
  model: z.enum(["sonnet", "opus", "haiku"]),
});

export async function saveAiDemoSettings(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const admin = await requireAdmin();
  const p = configSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  if (p.data.enabled && !p.data.baseUrl) return { ok: false, error: t("Fill in the demo API address first."), fieldErrors: { baseUrl: t("Fill in the demo API address first.") } };
  await saveDemoConfig(p.data, admin.id);
  refresh();
  return succeed(t("Settings saved."));
}

/** Check the SAVED connection and show the daily allowance a new demo teacher would get. */
export async function testAiDemoConnection(): Promise<ActionResult<DemoAdvice>> {
  const t = await getT();
  await requireAdmin();
  const cfg = await getDemoConfig();
  const r = await guarded(() => demoAdvice({ ...cfg, enabled: true }));
  if (!r.ok) return r.result;
  return succeed(t("Connected. A new demo teacher would get {0} AI tokens per day.", r.value.kuota.toLocaleString("id-ID")), r.value);
}

const userIdSchema = z.string().min(1).max(100);

export async function approveAiDemo(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const admin = await requireAdmin();
  const p = z.object({ userId: userIdSchema, days: z.number().int().min(1).max(DEMO_MAX_DAYS) }).safeParse(data);
  if (!p.success) return zodError(p.error);
  const r = await guarded(() => approveDemoRequest(p.data.userId, p.data.days, admin.id));
  if (!r.ok) return r.result;
  refresh();
  return succeed(t("Approved. The demo is set up in the teacher's AI Settings ({0} AI tokens per day).", (r.value.kuota ?? 0).toLocaleString("id-ID")));
}

export async function rejectAiDemo(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const admin = await requireAdmin();
  const p = z.object({ userId: userIdSchema, reason: z.string().trim().max(300).default("") }).safeParse(data);
  if (!p.success) return zodError(p.error);
  const r = await guarded(() => rejectDemoRequest(p.data.userId, p.data.reason, admin.id));
  if (!r.ok) return r.result;
  refresh();
  return succeed(t("Request rejected."));
}

export async function revokeAiDemo(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const admin = await requireAdmin();
  const p = z.object({ userId: userIdSchema }).safeParse(data);
  if (!p.success) return zodError(p.error);
  const r = await guarded(() => revokeDemo(p.data.userId, admin.id));
  if (!r.ok) return r.result;
  refresh();
  return succeed(t("The AI demo was ended."));
}
