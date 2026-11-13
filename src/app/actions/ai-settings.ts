"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { zodError } from "@/lib/action-result-server";
import { aiErrorMessage, generateImage, generateText, listModels } from "@/lib/ai";
import { aiSettingsSchema, clearAiKey as forgetKey, saveAiConfig } from "@/lib/ai-config";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

// Every teacher manages their own AI settings; the Super Admin's are the server's (see lib/ai-config.ts).
// Server actions are public POST endpoints, so each one checks requireTeacher() itself. A key sent in `data` is never echoed back.

const refresh = () => revalidatePath("/", "layout");
const providerField = z.enum(["claude-cli", "anthropic", "gemini", "cloudflare", "ollama"]);

export async function saveAiSettings(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = aiSettingsSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  await saveAiConfig(p.data, teacher.id);
  refresh();
  return succeed(t("AI settings saved."));
}

export async function clearAiKey(provider: unknown): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = z.enum(["anthropic", "gemini", "cloudflare"]).safeParse(provider);
  if (!p.success) return fail(t("Unknown provider."));
  await forgetKey(p.data, teacher.id);
  refresh();
  return succeed(t("The saved key was removed."));
}

/** A tiny real request through the SAVED settings (save first, then test). Does not use anyone's daily allowance. */
export async function testAiProvider(provider: unknown): Promise<ActionResult<{ ms: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = providerField.safeParse(provider);
  if (!p.success) return fail(t("Unknown provider."));
  const started = Date.now();
  try {
    await generateText({ system: "This is a connection test.", prompt: "Reply with the single word OK.", maxTokens: 64, provider: p.data, owner: teacher.id });
  } catch (e) {
    return fail(t(aiErrorMessage(e)));
  }
  const ms = Date.now() - started;
  return succeed(t("Connected — the provider answered in {0} ms.", ms), { ms });
}

/** The model list of one provider, for the pickers. Uses the SAVED settings (a new key must be saved first). */
export async function listProviderModels(provider: unknown): Promise<ActionResult<{ models: string[] }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = providerField.safeParse(provider);
  if (!p.success) return fail(t("Unknown provider."));
  try {
    return succeed(undefined, { models: await listModels(p.data, teacher.id) });
  } catch (e) {
    return fail(t(aiErrorMessage(e)));
  }
}

/** Makes one small picture with the SAVED Cloudflare Workers AI settings (uses a little of the free daily allowance, not the AI limit). */
export async function testCloudflareImage(): Promise<ActionResult<{ ms: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const started = Date.now();
  try {
    await generateImage({ prompt: "a red apple on a white table", provider: "cloudflare", owner: teacher.id, steps: 1 });
  } catch (e) {
    return fail(t(aiErrorMessage(e)));
  }
  const ms = Date.now() - started;
  return succeed(t("Connected — Cloudflare made a test picture in {0} ms.", ms), { ms });
}
