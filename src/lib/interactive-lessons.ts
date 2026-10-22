import { z } from "zod";
import { midiToNote, noteToMidi } from "@/lib/music";
import { isRestGlyph, NOTE_GLYPH_BEATS, NOTE_GLYPH_KINDS } from "@/lib/music-blocks";

/**
 * Registry of interactive lesson components available for the "interactive" material type.
 *  Safe to import from server code: metadata only, no component code (that lives in
 *  src/components/lessons/registry.tsx, which is client-only).
 */
export type InteractiveLessonMeta = { slug: string; title: string; description: string };

export const INTERACTIVE_LESSONS: InteractiveLessonMeta[] = [
  {
    slug: "pola-irama-sederhana",
    title: "Pola Irama & Ritme Sederhana",
    description: "Menirukan pola irama sederhana dengan tepuk tangan, hentakan kaki, dan alat musik ritmis (Seni Musik, Kelas VII).",
  },
  {
    slug: "menulis-melodi-piano-roll",
    title: "Menulis Melodi dengan Piano Roll",
    description: "Menulis nada (bukan hanya ritme) memakai piano roll interaktif dan membaca hasilnya sebagai notasi balok (Seni Musik, Kelas VIII).",
  },
];

export function isInteractiveLessonSlug(slug: string | null | undefined): slug is string {
  return Boolean(slug) && INTERACTIVE_LESSONS.some((l) => l.slug === slug);
}

export function interactiveLessonTitle(slug: string | null | undefined): string | null {
  return INTERACTIVE_LESSONS.find((l) => l.slug === slug)?.title ?? null;
}

/* ------------------------------------------------------------------ */
/* AI-generated interactive lessons (material.interactiveData)          */
/* ------------------------------------------------------------------ */

/** Melody examples are drawn on the default piano-roll range, C4–C5. */
export const MELODY_EXAMPLE_LOW = 60;
export const MELODY_EXAMPLE_HIGH = 72;

const text = z.string().trim().min(1);

export const checkShape = z.object({
  q: text,
  options: z.array(text).length(4),
  correct: z.number().int().min(0).max(3),
  explain: text,
});

export const conceptShape = z.object({ term: text, meaning: text });

const rhythmExampleShape = z
  .object({
    kind: z.literal("rhythm"),
    title: z.string().trim(),
    caption: z.string().trim(),
    pattern: z.array(z.enum(NOTE_GLYPH_KINDS)).min(1).max(32),
  })
  .refine((e) => e.pattern.some((c) => !isRestGlyph(c)) && e.pattern.reduce((beats, c) => beats + NOTE_GLYPH_BEATS[c], 0) <= 16, "Invalid rhythm example");

const isExampleNote = (step: string) => {
  const midi = noteToMidi(step);
  return midi !== null && midi >= MELODY_EXAMPLE_LOW && midi <= MELODY_EXAMPLE_HIGH;
};

/** Each step is one quarter note: a note name from C4 to C5 (e.g. "E4", "F#4") or "-" for a rest. */
const melodyExampleShape = z
  .object({
    kind: z.literal("melody"),
    title: z.string().trim(),
    caption: z.string().trim(),
    notes: z.array(z.string().refine((s) => s === "-" || isExampleNote(s))).min(2).max(16),
  })
  .refine((e) => e.notes.filter((n) => n !== "-").length >= 2, "Invalid melody example");

export const exampleShape = z.union([rhythmExampleShape, melodyExampleShape]);

const sectionShape = z.object({
  /** Short name for the navigation tab; older lessons don't have one. */
  label: z.string().trim().min(1).max(40).optional(),
  heading: text,
  body: text,
  concepts: z.array(conceptShape).max(6).optional(),
  example: exampleShape.optional(),
  check: checkShape.optional(),
});

export const caseStudyShape = z.object({ title: text, story: text, questions: z.array(text).min(1).max(5), discussion: text });

/** Graded practice tool shown with the closing task (its score goes into the teacher's practice recap). */
export const TASK_PRACTICES = ["none", "rhythm", "tempo", "melody", "solfege"] as const;

export const taskShape = z.object({ title: text, steps: z.array(text).min(1).max(8), practice: z.enum(TASK_PRACTICES) });

/**
 * Structured data for an AI-generated interactive lesson, rendered page by page by AiInteractiveLesson
 * (components/lessons) like the hand-made lessons: cover, content parts (with key terms, a playable music
 * example and a self-check), case study, quiz, summary and a closing task. Only `sections` is required, so
 * lessons generated before the cover/quiz/etc. existed still render. Text/data only — never executable code.
 */
export const interactiveLessonSchema = z.object({
  title: text.optional(),
  hook: text.optional(),
  objectives: z.array(text).max(6).optional(),
  needs: z.array(text).max(6).optional(),
  sections: z.array(sectionShape).min(1).max(8),
  caseStudy: caseStudyShape.optional(),
  quiz: z.array(checkShape).max(8).optional(),
  summary: z.array(text).max(10).optional(),
  task: taskShape.optional(),
});

export type InteractiveLessonData = z.infer<typeof interactiveLessonSchema>;
export type InteractiveCheck = z.infer<typeof checkShape>;
export type InteractiveSection = InteractiveLessonData["sections"][number];
export type InteractiveExample = z.infer<typeof exampleShape>;
export type InteractiveTask = z.infer<typeof taskShape>;
export type InteractiveCaseStudy = z.infer<typeof caseStudyShape>;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strings = (v: unknown, max: number) => list(v).map(str).filter(Boolean).slice(0, max);
const orNone = <T>(items: T[]) => (items.length ? items : undefined);
function valid<T>(shape: z.ZodType<T>, v: unknown): T | undefined {
  const r = shape.safeParse(v);
  return r.success ? r.data : undefined;
}
const validList = <T>(shape: z.ZodType<T>, v: unknown, max: number) => orNone(list(v).flatMap((x) => valid(shape, x) ?? []).slice(0, max));

/** "e4" -> "E4", "Db4" -> "C#4", "rest"/"" -> "-"; anything unreadable is kept as-is so validation rejects it. */
export function melodyStep(v: unknown): string {
  const s = str(v);
  if (!s || /^(-|rest|r|x)$/i.test(s)) return "-";
  const midi = noteToMidi(s);
  return midi === null ? s : midiToNote(midi);
}

function normalizeExample(e: Record<string, unknown>): InteractiveExample | undefined {
  const base = { title: str(e.title), caption: str(e.caption) };
  if (e.kind === "rhythm") return valid(rhythmExampleShape, { kind: "rhythm", ...base, pattern: e.pattern });
  if (e.kind === "melody") return valid(melodyExampleShape, { kind: "melody", ...base, notes: list(e.notes).map(melodyStep) });
  return undefined;
}

function normalizeSection(s: Record<string, unknown>): InteractiveSection | null {
  const heading = str(s.heading);
  const body = str(s.body);
  if (!heading || !body) return null;
  return {
    label: str(s.label).slice(0, 40) || undefined,
    heading,
    body,
    concepts: validList(conceptShape, s.concepts, 6),
    example: normalizeExample(obj(s.example)),
    check: valid(checkShape, s.check),
  };
}

/**
 * Turns the AI's reply into a lesson, keeping every part that is valid and dropping the rest — one malformed
 * quiz question or music example shouldn't cost the teacher the whole lesson. Null when no usable section is left.
 */
export function normalizeInteractiveLesson(raw: unknown): InteractiveLessonData | null {
  const o = obj(raw);
  const sections = list(o.sections)
    .flatMap((s) => normalizeSection(obj(s)) ?? [])
    .slice(0, 8);
  if (sections.length === 0) return null;
  const cs = obj(o.caseStudy);
  const task = obj(o.task);
  const lesson = {
    title: str(o.title) || undefined,
    hook: str(o.hook) || undefined,
    objectives: orNone(strings(o.objectives, 6)),
    needs: orNone(strings(o.needs, 6)),
    sections,
    caseStudy: valid(caseStudyShape, { title: str(cs.title), story: str(cs.story), questions: strings(cs.questions, 5), discussion: str(cs.discussion) }),
    quiz: validList(checkShape, o.quiz, 8),
    summary: orNone(strings(o.summary, 10)),
    task: valid(taskShape, { title: str(task.title), steps: strings(task.steps, 8), practice: (TASK_PRACTICES as readonly string[]).includes(str(task.practice)) ? str(task.practice) : "none" }),
  };
  return valid(interactiveLessonSchema, lesson) ?? null;
}
