"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { aiErrorMessage, generateImage, generateText, illustrationProvider, imageReadyFor, photoProvider, refundAllowance, takeAllowance, type ImageReady } from "@/lib/ai";
import { ILLUSTRATION_SYSTEM, cleanSvg, illustrationPrompt } from "@/lib/ai-illustration";
import { storageQuotaBytes } from "@/lib/platform";
import { requireTeacher } from "@/lib/session";
import { saveFile, usedBytes } from "@/lib/storage";
import { getT } from "@/i18n/server";

const schema = z.object({
  prompt: z.string().trim().min(3, "Describe the picture (at least 3 characters)").max(1500, "The description is too long"),
  /** "question": the picture of the question itself; "option": a small picture for one answer choice. */
  shape: z.enum(["question", "option"]),
});

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** The teacher's description wrapped with what every exam picture needs (clear, no stray text that could give the answer away). */
function imagePrompt(description: string, shape: "question" | "option") {
  return [
    "Make one picture for a school music test (Indonesian junior/senior high school).",
    shape === "option"
      ? "The picture is ONE answer choice of a multiple-choice question: show only the thing described, centered, filling the frame."
      : "The picture goes with the question text and helps students answer it.",
    `Picture description (from the teacher, may be in Indonesian): ${description}`,
    "Style: clear, accurate, simple educational illustration or realistic photo-like picture on a plain light background, good contrast, no frame, no watermark.",
    "Do NOT write any words, letters, numbers or labels in the picture unless the description explicitly asks for them. If musical instruments or notation are shown, draw them correctly.",
  ].join("\n");
}

/**
 * FLUX (Cloudflare) understands short, concrete English prompts best and tends to draw any "no text" instruction as
 * text: the teacher's description (often Indonesian) is rewritten by the teacher's text AI. Without one, or if that
 * fails, the description is used as written.
 */
async function fluxPrompt(description: string, shape: "question" | "option", owner: string): Promise<string> {
  const tail = shape === "option" ? "single object, centered, plain white background, clear educational photo" : "clear educational picture, plain light background";
  try {
    const { text } = await generateText({
      system: "You write prompts for an image generator (FLUX). Reply with ONLY the prompt: one line in English, at most 60 words.",
      prompt: `Rewrite this picture description from a music teacher (it may be in Indonesian) as an English image prompt. Describe only what must be visible, concretely and positively: never write "no ...". Draw musical instruments with their correct shape and parts.${shape === "option" ? " The picture shows a single object, centered, on a plain white background." : ""}\n\nDescription: ${description}`,
      maxTokens: 300,
      owner,
    });
    const line = text.replace(/^["'`\s]+|["'`\s]+$/g, "").split("\n")[0].trim();
    if (line.length >= 3) return `${line}, ${tail}`;
  } catch (e) {
    console.warn("[ai-image] prompt rewrite failed, using the description as written:", e instanceof Error ? e.message : e);
  }
  return `${description}, ${tail}`;
}

/** Which kinds of AI pictures the signed-in teacher can make. */
export async function aiImageReady(): Promise<ImageReady> {
  const teacher = await requireTeacher();
  return imageReadyFor(teacher.id);
}

/**
 * Make a realistic picture from the teacher's description (Cloudflare Workers AI or Gemini) and save it in the teacher's media.
 * Returns the media key; the caller puts it on the question or on a choice.
 */
export async function generateAiImage(data: unknown): Promise<ActionResult<{ key: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = schema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const provider = await photoProvider(teacher.id);
  if (!provider) return fail(t("Realistic pictures need Cloudflare Workers AI (free daily allowance) or a Gemini key with an image quota. Set one up in AI Settings."));

  const quota = await storageQuotaBytes(teacher.id);
  if (quota !== null && (await usedBytes(`media/${teacher.id}/`)) + 2 * 1024 * 1024 > quota) {
    return fail(t("Your upload space is full ({0} MB). Delete unused files or ask the admin for more space.", Math.round(quota / 1024 / 1024)));
  }
  if (!(await takeAllowance(teacher.id))) return fail(t("You have reached today's AI usage limit. Try again tomorrow."));

  try {
    const prompt = provider === "cloudflare" ? await fluxPrompt(p.data.prompt, p.data.shape, teacher.id) : imagePrompt(p.data.prompt, p.data.shape);
    const img = await generateImage({ prompt, provider, owner: teacher.id, aspectRatio: p.data.shape === "option" ? "1:1" : "4:3" });
    const ext = EXT[img.mediaType] ?? "png";
    const key = `media/${teacher.id}/${randomUUID()}.${ext}`;
    await saveFile(key, img.data, img.mediaType in EXT ? img.mediaType : "image/png");
    return succeed(t("The AI picture is ready."), { key });
  } catch (e) {
    await refundAllowance(teacher.id).catch(() => undefined);
    return fail(t(aiErrorMessage(e)));
  }
}

/**
 * An illustration drawn by Claude as SVG code (the browser turns it into a PNG and uploads it).
 * Uses Claude Code or the Anthropic API when available, else the teacher's other text AI.
 */
export async function generateAiIllustration(data: unknown): Promise<ActionResult<{ svg: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = schema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const provider = await illustrationProvider(teacher.id);
  if (!provider) return fail(t("AI is not set up yet. Add your own Gemini or Anthropic API key in AI Settings first."));
  if (!(await takeAllowance(teacher.id))) return fail(t("You have reached today's AI usage limit. Try again tomorrow."));

  try {
    const { text } = await generateText({ system: ILLUSTRATION_SYSTEM, prompt: illustrationPrompt(p.data.prompt, p.data.shape), maxTokens: 16000, provider, owner: teacher.id });
    return succeed(undefined, { svg: cleanSvg(text, p.data.shape) });
  } catch (e) {
    await refundAllowance(teacher.id).catch(() => undefined);
    return fail(t(aiErrorMessage(e)));
  }
}
