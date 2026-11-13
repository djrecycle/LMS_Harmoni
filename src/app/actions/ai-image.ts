"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { aiErrorMessage, canMakeImages, generateImage, refundAllowance, takeAllowance } from "@/lib/ai";
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

/** Whether the AI image button can work for this teacher (a Gemini key is set). */
export async function aiImageReady(): Promise<boolean> {
  const teacher = await requireTeacher();
  return canMakeImages(teacher.id);
}

/**
 * Make a picture from the teacher's description with the AI (Gemini) and save it in the teacher's media.
 * Returns the media key; the caller puts it on the question or on a choice.
 */
export async function generateAiImage(data: unknown): Promise<ActionResult<{ key: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = schema.safeParse(data);
  if (!p.success) return zodError(p.error);
  if (!(await canMakeImages(teacher.id))) return fail(t("Making images needs a Gemini API key (Anthropic cannot make images). Add your Gemini key in AI Settings."));

  const quota = await storageQuotaBytes(teacher.id);
  if (quota !== null && (await usedBytes(`media/${teacher.id}/`)) + 2 * 1024 * 1024 > quota) {
    return fail(t("Your upload space is full ({0} MB). Delete unused files or ask the admin for more space.", Math.round(quota / 1024 / 1024)));
  }
  if (!(await takeAllowance(teacher.id))) return fail(t("You have reached today's AI usage limit. Try again tomorrow."));

  try {
    const img = await generateImage({ prompt: imagePrompt(p.data.prompt, p.data.shape), owner: teacher.id, aspectRatio: p.data.shape === "option" ? "1:1" : "4:3" });
    const ext = EXT[img.mediaType] ?? "png";
    const key = `media/${teacher.id}/${randomUUID()}.${ext}`;
    await saveFile(key, img.data, img.mediaType in EXT ? img.mediaType : "image/png");
    return succeed(t("The AI picture is ready."), { key });
  } catch (e) {
    await refundAllowance(teacher.id).catch(() => undefined);
    return fail(t(aiErrorMessage(e)));
  }
}
