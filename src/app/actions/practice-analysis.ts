"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getOwnedMaterial } from "@/lib/access";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { aiErrorMessage, generateJson, isPerangkatAiAvailable, providerUnavailableMessage, refundAllowance, takeAllowance } from "@/lib/ai";
import { ruleAnalysis } from "@/lib/practice-analysis";
import { loadPracticeRecap } from "@/lib/practice-recap";
import { requireTeacher } from "@/lib/session";
import { getLocale, getT } from "@/i18n/server";

const S = schema;
const AI_BATCH = 25;

const request = z.object({
  materialId: z.string().uuid(),
  /** Students to analyse; empty = everyone in the lesson's classes who has practised. */
  studentIds: z.array(z.string().min(1)).max(500).default([]),
  source: z.enum(["rule", "ai"]),
});

const aiSchema = {
  type: "object",
  properties: {
    analyses: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"], additionalProperties: false },
    },
  },
  required: ["analyses"],
  additionalProperties: false,
};

/**
 * Write (or rewrite) the practice analysis of students in one lesson, on the teacher's request: rule-based (instant,
 *  free) or by AI (one AI call per 25 students, counted as one use of the teacher's daily AI allowance).
 *  Students are sent to the AI as anonymous codes, never by name.
 */
export async function generatePracticeAnalysis(data: unknown): Promise<ActionResult<{ count: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = request.safeParse(data);
  if (!p.success) return zodError(p.error);
  const { materialId, studentIds, source } = p.data;
  const material = await getOwnedMaterial(teacher.id, materialId);
  if (!material) return fail(t("Lesson not found."));

  const { rows, attempts } = await loadPracticeRecap(t, materialId);
  const wanted = new Set(studentIds);
  const targets = rows.filter((r) => r.attempts > 0 && (wanted.size === 0 || wanted.has(r.studentId)));
  if (!targets.length) return fail(t("No student has practised in this lesson yet."));

  const texts = new Map<string, string>();
  for (const r of targets) texts.set(r.studentId, ruleAnalysis(t, attempts.get(r.studentId) ?? []));

  const aiWritten = new Set<string>();
  if (source === "ai") {
    if (!(await isPerangkatAiAvailable())) return fail(t(providerUnavailableMessage("auto")));
    if (!(await takeAllowance(teacher.id))) return fail(t("You have reached today's AI usage limit. Try again tomorrow."));
    const language = (await getLocale()) === "id" ? "Indonesian" : "English";
    try {
      for (let i = 0; i < targets.length; i += AI_BATCH) {
        const batch = targets.slice(i, i + AI_BATCH);
        const code = (j: number) => `S${i + j + 1}`;
        const { data: out } = await generateJson<{ analyses?: { id?: string; text?: string }[] }>({
          system: `You help a Music (Seni Musik) teacher in an Indonesian school write short feedback on students' practice results. Write in ${language}.
For each student, write 2-3 sentences for the teacher's recap: what the student does well, the main problem (be specific: early/late, rushing/dragging, wrong pitch, which solfège syllables), and one concrete next step for practice. Use only the facts given; never invent scores or problems. Do not use the student's code in the text; do not greet. Plain text, no Markdown.`,
          user: `Lesson: ${material.title}\n\n${batch.map((r, j) => `${code(j)}: ${texts.get(r.studentId)}`).join("\n")}\n\nReturn one analysis per student code.`,
          schema: aiSchema,
          maxTokens: 6000,
          effort: "low",
        });
        for (const a of out.analyses ?? []) {
          const j = batch.findIndex((_, k) => code(k) === a.id?.trim());
          const text = a.text?.trim();
          if (j >= 0 && text) {
            texts.set(batch[j].studentId, text.slice(0, 2000));
            aiWritten.add(batch[j].studentId);
          }
        }
      }
    } catch (e) {
      await refundAllowance(teacher.id);
      return fail(t(aiErrorMessage(e)));
    }
  }

  const now = new Date();
  for (const r of targets) {
    const values = { text: texts.get(r.studentId)!, source: aiWritten.has(r.studentId) ? ("ai" as const) : ("rule" as const), attempts: r.attempts, createdAt: now };
    await db
      .insert(S.practiceAnalysis)
      .values({ materialId, studentId: r.studentId, ...values })
      .onConflictDoUpdate({ target: [S.practiceAnalysis.materialId, S.practiceAnalysis.studentId], set: values });
  }
  revalidatePath(`/teacher/materials/${materialId}/practice`);
  return succeed(t("Analysis written for {0} students.", targets.length), { count: targets.length });
}
