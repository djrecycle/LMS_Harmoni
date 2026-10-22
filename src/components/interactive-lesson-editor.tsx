"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { AiInteractiveLesson } from "@/components/lessons/ai-interactive-lesson";
import { NoteGlyph, type NoteGlyphKind } from "@/components/lessons/note-glyph";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import {
  caseStudyShape,
  checkShape,
  conceptShape,
  exampleShape,
  melodyStep,
  normalizeInteractiveLesson,
  taskShape,
  type InteractiveCaseStudy,
  type InteractiveCheck,
  type InteractiveExample,
  type InteractiveLessonData,
  type InteractiveSection,
  type InteractiveTask,
} from "@/lib/interactive-lessons";
import { NOTE_GLYPH_BEATS, NOTE_GLYPH_KINDS } from "@/lib/music-blocks";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const MAX_SECTIONS = 8;
const MAX_QUIZ = 8;

const setAt = <T,>(items: T[], i: number, v: T) => items.map((x, j) => (j === i ? v : x));
const removeAt = <T,>(items: T[], i: number) => items.filter((_, j) => j !== i);
function moveAt<T>(items: T[], i: number, by: number) {
  const j = i + by;
  if (j < 0 || j >= items.length) return items;
  const copy = [...items];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
const filled = (items: string[]) => items.filter((s) => s.trim());

const newCheck = (): InteractiveCheck => ({ q: "", options: ["", "", "", ""], correct: 0, explain: "" });
const newExample = (kind: InteractiveExample["kind"]): InteractiveExample =>
  kind === "rhythm"
    ? { kind, title: "", caption: "", pattern: ["quarter", "quarter", "eighth", "eighth", "quarter"] }
    : { kind, title: "", caption: "", notes: ["C4", "D4", "E4", "F4", "G4"] };

/**
 * Lets the teacher edit an AI-generated interactive lesson part by part (cover, content parts with key terms,
 * music example and self-check, case study, quiz, summary, final task) and preview it as students will see it.
 * The draft may hold incomplete parts while editing; they're flagged here and left out when saved
 * (the form serializes the draft through normalizeInteractiveLesson).
 */
export function InteractiveLessonEditor({
  value,
  onChange,
  title,
  materialId,
}: {
  value: InteractiveLessonData;
  onChange: (data: InteractiveLessonData) => void;
  title: string;
  materialId?: string;
}) {
  const t = useT();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const normalized = useMemo(() => normalizeInteractiveLesson(value), [value]);
  const patch = (p: Partial<InteractiveLessonData>) => onChange({ ...value, ...p });
  const sections = value.sections;
  const quiz = value.quiz ?? [];

  return (
    // grid-cols-1 (minmax(0,1fr)): long part titles wrap instead of widening the form past a phone screen.
    <div className="grid grid-cols-1 gap-4 rounded-lg border p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{t("Interactive lesson")}</p>
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
          <button type="button" onClick={() => setMode("edit")} className={cn("rounded-md px-3 py-1", mode === "edit" && "bg-card shadow-xs")}>
            {t("Edit")}
          </button>
          <button type="button" onClick={() => setMode("preview")} className={cn("rounded-md px-3 py-1", mode === "preview" && "bg-card shadow-xs")}>
            {t("Preview")}
          </button>
        </div>
      </div>

      {!normalized && <Alert kind="error">{t("The lesson needs at least one part with a heading and text before it can be saved.")}</Alert>}

      {mode === "preview" ? (
        normalized ? (
          <AiInteractiveLesson data={normalized} title={title} materialId={materialId ?? ""} completedInitial={false} preview />
        ) : null
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("Edit any part of the lesson. Incomplete parts are marked and left out when you save.")}</p>

          <Group title={t("Cover")}>
            <Field label={t("Cover heading")} hint={t("Empty = use the lesson title.")}>
              <Input value={value.title ?? ""} maxLength={150} onChange={(e) => patch({ title: e.target.value })} />
            </Field>
            <Field label={t("Opening hook")}>
              <Textarea rows={2} value={value.hook ?? ""} onChange={(e) => patch({ hook: e.target.value })} />
            </Field>
            <StringList label={t("Learning objectives")} items={value.objectives ?? []} max={6} onChange={(objectives) => patch({ objectives })} />
            <StringList label={t("What you need")} items={value.needs ?? []} max={6} onChange={(needs) => patch({ needs })} />
          </Group>

          {sections.map((s, i) => (
            <Group
              key={i}
              title={`${t("Part {0}", i + 1)} · ${s.heading.trim() || t("(untitled)")}`}
              incomplete={!s.heading.trim() || !s.body.trim()}
              actions={
                <RowActions
                  onUp={i > 0 ? () => patch({ sections: moveAt(sections, i, -1) }) : undefined}
                  onDown={i < sections.length - 1 ? () => patch({ sections: moveAt(sections, i, 1) }) : undefined}
                  onRemove={sections.length > 1 ? () => patch({ sections: removeAt(sections, i) }) : undefined}
                />
              }
            >
              <SectionEditor index={i} section={s} onChange={(next) => patch({ sections: setAt(sections, i, next) })} />
            </Group>
          ))}
          {sections.length < MAX_SECTIONS && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => patch({ sections: [...sections, { heading: "", body: "" }] })}>
                <Plus /> {t("Add part")}
              </Button>
            </div>
          )}

          <Group
            title={t("Case study")}
            optional={{ on: Boolean(value.caseStudy), add: () => patch({ caseStudy: { title: "", story: "", questions: [""], discussion: "" } }), remove: () => patch({ caseStudy: undefined }) }}
            incomplete={Boolean(value.caseStudy) && !caseStudyShape.safeParse({ ...value.caseStudy, questions: filled(value.caseStudy?.questions ?? []) }).success}
          >
            {value.caseStudy && <CaseStudyEditor caseStudy={value.caseStudy} onChange={(caseStudy) => patch({ caseStudy })} />}
          </Group>

          <Group title={`${t("Quiz")} (${quiz.length}/${MAX_QUIZ})`}>
            {quiz.map((item, i) => (
              <div key={i} className="grid gap-2 rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase">{t("Question {0}", i + 1)}</p>
                  <RowActions
                    onUp={i > 0 ? () => patch({ quiz: moveAt(quiz, i, -1) }) : undefined}
                    onDown={i < quiz.length - 1 ? () => patch({ quiz: moveAt(quiz, i, 1) }) : undefined}
                    onRemove={() => patch({ quiz: removeAt(quiz, i) })}
                  />
                </div>
                <CheckEditor id={`quiz-${i}`} check={item} onChange={(next) => patch({ quiz: setAt(quiz, i, next) })} />
              </div>
            ))}
            {quiz.length < MAX_QUIZ && (
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => patch({ quiz: [...quiz, newCheck()] })}>
                  <Plus /> {t("Add question")}
                </Button>
              </div>
            )}
          </Group>

          <Group title={t("Summary")}>
            <StringList label={t("Points to remember")} items={value.summary ?? []} max={10} multiline onChange={(summary) => patch({ summary })} />
          </Group>

          <Group
            title={t("Final task")}
            optional={{ on: Boolean(value.task), add: () => patch({ task: { title: "", steps: [""], practice: "none" } }), remove: () => patch({ task: undefined }) }}
            incomplete={Boolean(value.task) && !taskShape.safeParse({ ...value.task, steps: filled(value.task?.steps ?? []) }).success}
          >
            {value.task && <TaskEditor task={value.task} onChange={(task) => patch({ task })} />}
          </Group>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Group({
  title,
  incomplete,
  actions,
  optional,
  children,
}: {
  title: string;
  incomplete?: boolean;
  actions?: React.ReactNode;
  /** An optional part the teacher can add or remove as a whole. */
  optional?: { on: boolean; add: () => void; remove: () => void };
  children?: React.ReactNode;
}) {
  const t = useT();
  const open = !optional || optional.on;
  return (
    <details open={open || undefined} className="group rounded-lg bg-muted/60 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
          <span className="min-w-0 break-words text-sm font-bold">{title}</span>
          {incomplete && <Incomplete />}
        </span>
        <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.preventDefault()}>
          {actions}
          {optional &&
            (optional.on ? (
              <Button type="button" variant="ghost" size="sm" onClick={optional.remove}>
                <Trash2 /> {t("Remove")}
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={optional.add}>
                <Plus /> {t("Add")}
              </Button>
            ))}
        </span>
      </summary>
      {open && <div className="mt-3 grid gap-3">{children}</div>}
    </details>
  );
}

function Incomplete() {
  const t = useT();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-danger" title={t("Incomplete — left out when saved")}>
      <TriangleAlert className="size-3.5" /> {t("Incomplete")}
    </span>
  );
}

function RowActions({ onUp, onDown, onRemove }: { onUp?: () => void; onDown?: () => void; onRemove?: () => void }) {
  const t = useT();
  return (
    <span className="flex items-center">
      <Button type="button" variant="ghost" size="sm" onClick={onUp} disabled={!onUp} aria-label={t("Move up")}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDown} disabled={!onDown} aria-label={t("Move down")}>
        <ArrowDown />
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={!onRemove} aria-label={t("Remove")}>
        <Trash2 />
      </Button>
    </span>
  );
}

/** Editable list of short texts; empty rows are dropped when saved. */
function StringList({
  label,
  items,
  max,
  multiline,
  onChange,
}: {
  label: string;
  items: string[];
  max: number;
  multiline?: boolean;
  onChange: (items: string[]) => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-semibold">{label}</p>
      {items.map((s, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="w-5 pt-2.5 text-right text-xs font-semibold text-muted-foreground">{i + 1}.</span>
          {multiline ? (
            <Textarea rows={2} className="min-h-0" value={s} onChange={(e) => onChange(setAt(items, i, e.target.value))} />
          ) : (
            <Input className="h-10" value={s} onChange={(e) => onChange(setAt(items, i, e.target.value))} />
          )}
          <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => onChange(removeAt(items, i))} aria-label={t("Remove")}>
            <X />
          </Button>
        </div>
      ))}
      {items.length < max && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...items, ""])}>
            <Plus /> {t("Add item")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionEditor({ index, section, onChange }: { index: number; section: InteractiveSection; onChange: (s: InteractiveSection) => void }) {
  const t = useT();
  const patch = (p: Partial<InteractiveSection>) => onChange({ ...section, ...p });
  const concepts = section.concepts ?? [];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label={t("Heading")}>
          <Input value={section.heading} onChange={(e) => patch({ heading: e.target.value })} />
        </Field>
        <Field label={t("Tab name (optional)")}>
          <Input value={section.label ?? ""} maxLength={40} onChange={(e) => patch({ label: e.target.value })} />
        </Field>
      </div>
      <Field label={t("Text")} hint={t("Markdown is supported: **bold**, lists, tables.")}>
        <Textarea rows={7} value={section.body} onChange={(e) => patch({ body: e.target.value })} />
      </Field>

      <div className="grid gap-1.5">
        <p className="text-sm font-semibold">{t("Key terms")}</p>
        {concepts.map((c, i) => (
          <div key={i} className="grid items-start gap-1.5 sm:grid-cols-[12rem_1fr_auto]">
            <Input className="h-10" placeholder={t("Term")} value={c.term} onChange={(e) => patch({ concepts: setAt(concepts, i, { ...c, term: e.target.value }) })} />
            <Input className="h-10" placeholder={t("Meaning")} value={c.meaning} onChange={(e) => patch({ concepts: setAt(concepts, i, { ...c, meaning: e.target.value }) })} />
            <span className="flex items-center gap-1">
              {!conceptShape.safeParse(c).success && <Incomplete />}
              <Button type="button" variant="ghost" size="sm" onClick={() => patch({ concepts: removeAt(concepts, i) })} aria-label={t("Remove")}>
                <X />
              </Button>
            </span>
          </div>
        ))}
        {concepts.length < 6 && (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => patch({ concepts: [...concepts, { term: "", meaning: "" }] })}>
              <Plus /> {t("Add key term")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {t("Music example")} {section.example && !exampleShape.safeParse(section.example).success && <Incomplete />}
          </p>
          <Select
            className="h-9 w-auto text-sm"
            value={section.example?.kind ?? "none"}
            onChange={(e) => {
              const kind = e.target.value;
              patch({ example: kind === "rhythm" || kind === "melody" ? newExample(kind) : undefined });
            }}
          >
            <option value="none">{t("None")}</option>
            <option value="rhythm">{t("Rhythm example")}</option>
            <option value="melody">{t("Melody example")}</option>
          </Select>
        </div>
        {section.example && <ExampleEditor example={section.example} onChange={(example) => patch({ example })} />}
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {t("Check your understanding")} {section.check && !checkShape.safeParse(section.check).success && <Incomplete />}
          </p>
          {section.check ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => patch({ check: undefined })}>
              <Trash2 /> {t("Remove")}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => patch({ check: newCheck() })}>
              <Plus /> {t("Add")}
            </Button>
          )}
        </div>
        {section.check && <CheckEditor id={`check-${index}`} check={section.check} onChange={(check) => patch({ check })} />}
      </div>
    </>
  );
}

/** A multiple-choice question with exactly four options; the radio marks the correct one. */
function CheckEditor({ id, check, onChange }: { id: string; check: InteractiveCheck; onChange: (c: InteractiveCheck) => void }) {
  const t = useT();
  const patch = (p: Partial<InteractiveCheck>) => onChange({ ...check, ...p });
  return (
    <div className="grid gap-2">
      <div className="flex items-start gap-2">
        <Textarea rows={2} className="min-h-0" placeholder={t("Question")} value={check.q} onChange={(e) => patch({ q: e.target.value })} />
        {!checkShape.safeParse(check).success && (
          <span className="pt-2">
            <Incomplete />
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("Choose the correct answer with the circle.")}</p>
      {check.options.map((opt, i) => (
        <label key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name={`correct-${id}`}
            className="size-4 shrink-0 accent-[var(--primary)]"
            checked={check.correct === i}
            onChange={() => patch({ correct: i })}
            aria-label={t("Correct answer")}
          />
          <span className="w-4 text-xs font-bold text-muted-foreground">{"ABCD"[i]}</span>
          <Input className={cn("h-10", check.correct === i && "border-success")} value={opt} onChange={(e) => patch({ options: setAt(check.options, i, e.target.value) })} />
        </label>
      ))}
      <Textarea rows={2} className="min-h-0" placeholder={t("Explanation shown after answering")} value={check.explain} onChange={(e) => patch({ explain: e.target.value })} />
    </div>
  );
}

function ExampleEditor({ example, onChange }: { example: InteractiveExample; onChange: (e: InteractiveExample) => void }) {
  const t = useT();
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input className="h-10" placeholder={t("Example title (optional)")} value={example.title} onChange={(e) => onChange({ ...example, title: e.target.value })} />
        <Input className="h-10" placeholder={t("Caption (optional)")} value={example.caption} onChange={(e) => onChange({ ...example, caption: e.target.value })} />
      </div>
      {example.kind === "rhythm" ? (
        <RhythmPatternEditor pattern={example.pattern} onChange={(pattern) => onChange({ ...example, pattern })} />
      ) : (
        // Keyed by the notes so the text resyncs when the example changes from outside (e.g. parts reordered).
        <MelodyNotesInput key={example.notes.join(" ")} notes={example.notes} onChange={(notes) => onChange({ ...example, notes })} />
      )}
    </>
  );
}

const GLYPH_LABEL: Record<NoteGlyphKind, string> = {
  whole: "Whole note",
  half: "Half note",
  quarter: "Quarter note",
  eighth: "Eighth note",
  "rest-quarter": "Quarter rest",
  "rest-eighth": "Eighth rest",
};

/** Build a rhythm by appending note values / rests; click a cell to remove it. At most 16 beats. */
function RhythmPatternEditor({ pattern, onChange }: { pattern: NoteGlyphKind[]; onChange: (pattern: NoteGlyphKind[]) => void }) {
  const t = useT();
  const beats = pattern.reduce((sum, k) => sum + NOTE_GLYPH_BEATS[k], 0);
  return (
    <div className="grid gap-2">
      <div className="flex min-h-12 flex-wrap gap-1 rounded-md bg-muted p-1.5">
        {pattern.map((k, i) => (
          <button
            key={i}
            type="button"
            title={t("Click to remove")}
            onClick={() => onChange(removeAt(pattern, i))}
            className="grid place-items-center rounded-md bg-card px-1.5 py-1 hover:bg-danger-soft"
          >
            <NoteGlyph kind={k} />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {NOTE_GLYPH_KINDS.map((k) => (
          <Button
            key={k}
            type="button"
            variant="outline"
            size="sm"
            title={t(GLYPH_LABEL[k])}
            disabled={pattern.length >= 32 || beats + NOTE_GLYPH_BEATS[k] > 16}
            onClick={() => onChange([...pattern, k])}
          >
            <NoteGlyph kind={k} className="size-5" />
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">{t("{0} of 16 beats", beats)}</span>
      </div>
    </div>
  );
}

/** Notes typed as text ("C4 D4 E4 - G4"); committed on blur. */
function MelodyNotesInput({ notes, onChange }: { notes: string[]; onChange: (notes: string[]) => void }) {
  const t = useT();
  const [text, setText] = useState(notes.join(" "));
  return (
    <Field label={t("Notes")} hint={t("One quarter note each, from C4 to C5, separated by spaces. Use - for a rest. Example: C4 D4 E4 - G4")}>
      <Input
        className="h-10 font-mono"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.split(/[\s,]+/).filter(Boolean).map(melodyStep))}
      />
    </Field>
  );
}

function CaseStudyEditor({ caseStudy, onChange }: { caseStudy: InteractiveCaseStudy; onChange: (c: InteractiveCaseStudy) => void }) {
  const t = useT();
  const patch = (p: Partial<InteractiveCaseStudy>) => onChange({ ...caseStudy, ...p });
  return (
    <>
      <Field label={t("Title")}>
        <Input value={caseStudy.title} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <Field label={t("Story")}>
        <Textarea rows={5} value={caseStudy.story} onChange={(e) => patch({ story: e.target.value })} />
      </Field>
      <StringList label={t("Questions to analyze")} items={caseStudy.questions} max={5} onChange={(questions) => patch({ questions })} />
      <Field label={t("Short discussion")}>
        <Textarea rows={3} value={caseStudy.discussion} onChange={(e) => patch({ discussion: e.target.value })} />
      </Field>
    </>
  );
}

function TaskEditor({ task, onChange }: { task: InteractiveTask; onChange: (t: InteractiveTask) => void }) {
  const t = useT();
  const patch = (p: Partial<InteractiveTask>) => onChange({ ...task, ...p });
  return (
    <>
      <Field label={t("Title")}>
        <Input value={task.title} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <StringList label={t("Steps")} items={task.steps} max={8} onChange={(steps) => patch({ steps })} />
      <Field label={t("Practice tool")}>
        <Select value={task.practice} onChange={(e) => patch({ practice: e.target.value as InteractiveTask["practice"] })}>
          <option value="none">{t("None")}</option>
          <option value="rhythm">{t("Rhythm practice")}</option>
          <option value="tempo">{t("Steady tempo practice")}</option>
          <option value="melody">{t("Melody composer")}</option>
          <option value="solfege">{t("Solfège practice")}</option>
        </Select>
      </Field>
    </>
  );
}
