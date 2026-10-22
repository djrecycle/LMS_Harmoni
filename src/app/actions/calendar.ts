"use server";

import { after } from "next/server";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getOwnedCalendar } from "@/lib/access";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { aiErrorMessage, generateJson, isPerangkatAiAvailable, PROVIDER_CHOICES, providerUnavailableMessage, refundAllowance, takeAllowance, type ProviderChoice } from "@/lib/ai";
import { AiError } from "@/lib/ai-error";
import { extractKaldikText } from "@/lib/kaldik/extract";
import { buildPrompt, SCHEMA, SYSTEM } from "@/lib/kaldik/prompt";
import type { KaldikData } from "@/lib/calendar-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";
import { z } from "zod";

const S = schema;
const refresh = () => revalidatePath("/teacher/calendar");

async function runJob(id: string, teacherId: string, sourceText: string, choice: ProviderChoice) {
  let provider: string | null = null;
  try {
    const res = await generateJson<KaldikData>({ system: SYSTEM, user: buildPrompt(sourceText), schema: SCHEMA, provider: choice, maxTokens: 16000, effort: "medium" });
    provider = res.provider;
    const data = res.data;
    if (!data || !Array.isArray(data.semester)) throw new AiError("The AI result was incomplete.");
    const title = data.tahun_ajaran ? `Kalender Pendidikan ${data.tahun_ajaran}` : "Kalender Pendidikan";
    await db.update(S.academicCalendar).set({ data, title, tahunAjaran: data.tahun_ajaran || null, status: "done", error: null, provider }).where(and(eq(S.academicCalendar.id, id), eq(S.academicCalendar.status, "pending")));
  } catch (e) {
    console.error("[calendar] generation failed", e);
    const message = aiErrorMessage(e);
    const flipped = await db
      .update(S.academicCalendar)
      .set({ status: "error", error: message, provider })
      .where(and(eq(S.academicCalendar.id, id), eq(S.academicCalendar.status, "pending")))
      .returning({ id: S.academicCalendar.id });
    if (flipped.length) await refundAllowance(teacherId).catch(() => undefined);
  }
}

const uploadSchema = z.object({ provider: z.enum(PROVIDER_CHOICES).default("auto") });

export async function uploadCalendar(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = uploadSchema.safeParse({ provider: formData.get("provider") ?? "auto" });
  if (!p.success) return fail(t("Invalid request."));
  const { provider } = p.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(t("Choose a file first."));

  let sourceText: string;
  try {
    sourceText = await extractKaldikText(file);
  } catch (e) {
    return fail(t(e instanceof AiError ? e.message : "The file could not be read."));
  }

  if (!(await isPerangkatAiAvailable(provider))) return fail(t(providerUnavailableMessage(provider)));
  if (!(await takeAllowance(teacher.id))) return fail(t("You have reached today's AI usage limit. Try again tomorrow."));

  const [row] = await db
    .insert(S.academicCalendar)
    .values({ teacherId: teacher.id, title: "Kalender Pendidikan", sourceFileName: file.name.slice(0, 200), status: "pending" })
    .returning({ id: S.academicCalendar.id });
  after(() => runJob(row.id, teacher.id, sourceText, provider));
  refresh();
  return succeed(undefined, { id: row.id });
}

export async function deleteCalendar(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const existing = await getOwnedCalendar(teacher.id, id);
  if (!existing) return fail(t("Document not found."));
  await db.delete(S.academicCalendar).where(eq(S.academicCalendar.id, id));
  refresh();
  return succeed(t("Deleted."));
}
