"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CircleCheck, Play } from "lucide-react";
import { toast } from "sonner";
import { markMaterialCompleted } from "@/app/actions/material";
import { Markdown } from "@/components/markdown";
import { MelodyComposer } from "@/components/melody-composer";
import { PianoRoll } from "@/components/piano-roll";
import { RhythmPractice } from "@/components/rhythm-practice";
import { SolfegePractice } from "@/components/solfege-practice";
import { TempoPractice } from "@/components/tempo-practice";
import { StaffNotation } from "@/components/staff-notation";
import { Button } from "@/components/ui/button";
import { audioTime, scheduleClick, unlockAudio, type ClickVoice } from "@/lib/audio";
import type { InteractiveCaseStudy, InteractiveCheck, InteractiveExample, InteractiveLessonData, InteractiveSection, InteractiveTask } from "@/lib/interactive-lessons";
import { noteToMidi } from "@/lib/music";
import { isRestGlyph, melodyFromSteps, NOTE_GLYPH_BEATS } from "@/lib/music-blocks";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { NoteGlyph, type NoteGlyphKind } from "./note-glyph";
import { Eyebrow, LessonTabs, QuizItem, Reveal } from "./shared";

type Tab = { label: string } & ({ kind: "cover" | "case" | "quiz" | "summary" | "finish" } | { kind: "part"; index: number });

const shortLabel = (heading: string) => (heading.length <= 24 ? heading : `${heading.slice(0, 22).trimEnd()}…`);

/**
 * Renders an AI-generated interactive lesson (material.interactiveData) page by page, like the hand-made
 * lessons: numbered tabs, a cover, content parts, case study, quiz, summary and a closing task with the
 * completion mark. Parts missing from older lessons are simply left out. Quiz answers stay local (never
 * persisted); `preview` keeps the completion mark and practice scores local too.
 */
export function AiInteractiveLesson({
  data,
  title,
  materialId,
  completedInitial,
  preview,
}: {
  data: InteractiveLessonData;
  title: string;
  materialId: string;
  completedInitial: boolean;
  preview?: boolean;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [completed, setCompleted] = useState(completedInitial);

  const hasCover = Boolean(data.hook || data.objectives?.length || data.needs?.length);
  const tabs: Tab[] = [
    ...(hasCover ? [{ kind: "cover" as const, label: t("Cover") }] : []),
    ...data.sections.map((s, index) => ({ kind: "part" as const, index, label: s.label || shortLabel(s.heading) })),
    ...(data.caseStudy ? [{ kind: "case" as const, label: t("Case study") }] : []),
    ...(data.quiz?.length ? [{ kind: "quiz" as const, label: t("Quiz") }] : []),
    ...(data.summary?.length ? [{ kind: "summary" as const, label: t("Summary") }] : []),
    { kind: "finish", label: data.task ? t("Final task") : t("Finish") },
  ];
  const tab = tabs[Math.min(active, tabs.length - 1)];
  const quizTab = tabs.findIndex((x) => x.kind === "quiz");

  function go(i: number, fromBottom = false) {
    setActive(Math.max(0, Math.min(tabs.length - 1, i)));
    // The prev/next buttons sit under a long page: bring the top of the new part back into view.
    if (fromBottom && rootRef.current && rootRef.current.getBoundingClientRect().top < 0) rootRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={rootRef} className="grid scroll-mt-6 gap-6">
      <LessonTabs labels={tabs.map((x) => x.label)} active={active} onSelect={(i) => go(i)} label={t("Lesson parts")} />
      <p className="text-xs font-semibold text-muted-foreground">{t("Part {0} of {1}", active + 1, tabs.length)}</p>

      {/* Keyed so each page starts fresh: quiz choices, playback, etc. must not leak from one part into the next. */}
      <div key={active} className="rounded-2xl border bg-card p-5 shadow-xs sm:p-7">
        {tab.kind === "cover" && <Cover data={data} title={data.title || title} onStart={() => go(1)} onQuiz={quizTab >= 0 ? () => go(quizTab) : undefined} />}
        {tab.kind === "part" && <Part section={data.sections[tab.index]} number={tab.index + 1} />}
        {tab.kind === "case" && data.caseStudy && <CaseStudy caseStudy={data.caseStudy} />}
        {tab.kind === "quiz" && data.quiz && <Quiz items={data.quiz} />}
        {tab.kind === "summary" && data.summary && <Summary items={data.summary} />}
        {tab.kind === "finish" && (
          <Finish task={data.task} sections={data.sections} materialId={materialId} completed={completed} onCompleted={setCompleted} preview={preview} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => go(active - 1, true)} disabled={active === 0}>
          ← {t("Previous")}
        </Button>
        <span className="hidden min-w-0 truncate text-xs font-bold tracking-wide text-muted-foreground uppercase sm:inline">{tab.label}</span>
        <Button onClick={() => go(active + 1, true)} disabled={active >= tabs.length - 1}>
          {t("Next part")} →
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

function Cover({ data, title, onStart, onQuiz }: { data: InteractiveLessonData; title: string; onStart: () => void; onQuiz?: () => void }) {
  const t = useT();
  return (
    <section className="grid gap-5">
      <Eyebrow>{t("Interactive learning material")}</Eyebrow>
      <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {data.hook && <p className="text-lg text-muted-foreground italic">{data.hook}</p>}
      {data.objectives?.length || data.needs?.length ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {data.objectives?.length ? (
            <div>
              <h3 className="mb-2 text-sm font-bold text-primary uppercase">{t("Learning objectives")}</h3>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {data.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {data.needs?.length ? (
            <div>
              <h3 className="mb-2 text-sm font-bold text-primary uppercase">{t("What you need")}</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {data.needs.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={onStart}>
          {t("Start learning")} →
        </Button>
        {onQuiz && (
          <Button size="lg" variant="outline" onClick={onQuiz}>
            {t("Go straight to the quiz")}
          </Button>
        )}
      </div>
    </section>
  );
}

function Part({ section, number }: { section: InteractiveSection; number: number }) {
  const t = useT();
  return (
    <section className="grid gap-5">
      <Eyebrow>{t("Part {0}", number)}</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>
      <Markdown>{section.body}</Markdown>
      {section.concepts?.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {section.concepts.map((c, i) => (
            <div key={i} className="rounded-xl border bg-card p-4">
              <h3 className="mb-1.5 font-bold">{c.term}</h3>
              <p className="text-sm text-muted-foreground">{c.meaning}</p>
            </div>
          ))}
        </div>
      ) : null}
      {section.example && <Example example={section.example} />}
      {section.check && (
        <div className="grid gap-2">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("Check your understanding")}</p>
          <QuizItem index={0} item={section.check} />
        </div>
      )}
    </section>
  );
}

function CaseStudy({ caseStudy }: { caseStudy: InteractiveCaseStudy }) {
  const t = useT();
  return (
    <section className="grid gap-5">
      <Eyebrow>{t("Case study")}</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">{caseStudy.title}</h2>
      <div className="rounded-xl bg-muted p-5 text-sm leading-relaxed">
        <Markdown>{caseStudy.story}</Markdown>
      </div>
      <div className="grid gap-2">
        <p className="font-bold">{t("Try to analyze:")}</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          {caseStudy.questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </div>
      <Reveal title={t("See a short discussion")}>
        <Markdown>{caseStudy.discussion}</Markdown>
      </Reveal>
    </section>
  );
}

function Quiz({ items }: { items: InteractiveCheck[] }) {
  const t = useT();
  return (
    <section className="grid gap-5">
      <Eyebrow>{t("Check your understanding")}</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">{t("Short quiz")}</h2>
      <p className="text-muted-foreground">
        {t(
          "{0} multiple-choice questions to check your own understanding. Pick one answer, then press Check answer. This is self-practice — for an official grade, ask your teacher to open a quiz from the Quizzes menu.",
          items.length,
        )}
      </p>
      <div className="grid gap-4">
        {items.map((item, i) => (
          <QuizItem key={i} index={i} item={item} />
        ))}
      </div>
    </section>
  );
}

function Summary({ items }: { items: string[] }) {
  const t = useT();
  return (
    <section className="grid gap-5">
      <Eyebrow>{t("Summary")}</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">{t("What to remember")}</h2>
      <ul className="grid gap-2.5 text-sm">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2.5 rounded-lg bg-muted p-3">
            <CircleCheck className="size-4.5 shrink-0 text-success" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Finish({
  task,
  sections,
  materialId,
  completed,
  onCompleted,
  preview,
}: {
  task?: InteractiveTask;
  sections: InteractiveSection[];
  materialId: string;
  completed: boolean;
  onCompleted: (value: boolean) => void;
  preview?: boolean;
}) {
  const t = useT();
  const [busy, start] = useTransition();
  // Melody practice rewrites the lesson's first melody example (graded); without one it is free writing.
  const melodyTarget = useMemo(() => {
    const example = sections.find((s) => s.example?.kind === "melody")?.example;
    return example?.kind === "melody" ? melodyFromSteps(example.notes.map((n) => (n === "-" ? null : noteToMidi(n))), "quarter") : null;
  }, [sections]);

  function mark(value: boolean) {
    if (preview) {
      onCompleted(value);
      toast.info(t("Preview mode — completion isn't saved."));
      return;
    }
    start(async () => {
      const r = await markMaterialCompleted(materialId, value);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onCompleted(value);
      toast.success(r.message);
    });
  }

  return (
    <section className="grid gap-5">
      <Eyebrow>{task ? t("Final practice") : t("Finish")}</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">{task?.title ?? t("Finish the lesson")}</h2>
      {task ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {task.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">{t("You've reached the end of this lesson. Mark it as completed so your teacher can see your progress.")}</p>
      )}
      {task?.practice === "rhythm" && <RhythmPractice saveResult={!preview} materialId={materialId} />}
      {task?.practice === "tempo" && <TempoPractice saveResult={!preview} materialId={materialId} />}
      {task?.practice === "solfege" && <SolfegePractice saveResult={!preview} materialId={materialId} />}
      {task?.practice === "melody" &&
        (melodyTarget ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{t("Listen to the example, then write it again on the empty piano roll and check your answer.")}</p>
            <div className="rounded-xl bg-muted p-4">
              <PianoRoll {...melodyTarget} />
            </div>
            <MelodyComposer target={melodyTarget} saveResult={!preview} materialId={materialId} />
          </div>
        ) : (
          <MelodyComposer />
        ))}
      <div className="rounded-xl bg-muted p-4">
        {completed ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg bg-success-soft px-4 py-2.5 text-sm font-bold text-success">
              <CircleCheck className="size-5" /> {t("Lessons completed")}
            </span>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => mark(false)}>
              {t("Undo completed mark")}
            </Button>
          </div>
        ) : (
          <Button size="lg" disabled={busy} onClick={() => mark(true)}>
            <CircleCheck /> {t("Mark as completed")}
          </Button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Music examples                                                      */
/* ------------------------------------------------------------------ */

function Example({ example }: { example: InteractiveExample }) {
  const t = useT();
  return (
    <div className="grid gap-3 rounded-xl bg-muted p-4">
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {example.title || (example.kind === "rhythm" ? t("Rhythm example") : t("Melody example"))}
      </p>
      {example.kind === "rhythm" ? <RhythmExample pattern={example.pattern} /> : <MelodyExample notes={example.notes} />}
      {example.caption && <p className="text-sm text-muted-foreground">{example.caption}</p>}
    </div>
  );
}

const VOICES: { id: ClickVoice; label: string }[] = [
  { id: "tepuk", label: "Hand clap" },
  { id: "kentongan", label: "Kentongan" },
  { id: "tamborin", label: "Tambourine" },
];

const SYLLABLE: Record<NoteGlyphKind, string> = { whole: "ta-a-a-a", half: "ta-a", quarter: "ta", eighth: "ti", "rest-quarter": "—", "rest-eighth": "—" };

/** A rhythm the student can see (note values, ta/ti syllables, sound vs rest) and hear, with the playing cell lit up. */
function RhythmExample({ pattern }: { pattern: NoteGlyphKind[] }) {
  const t = useT();
  const [bpm, setBpm] = useState(80);
  const [voice, setVoice] = useState<ClickVoice>("tepuk");
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const { cells, beats } = useMemo(() => {
    let at = 0;
    const cells = pattern.map((kind) => {
      const cell = { kind, at, sound: !isRestGlyph(kind) };
      at += NOTE_GLYPH_BEATS[kind];
      return cell;
    });
    return { cells, beats: at };
  }, [pattern]);

  async function listen() {
    await unlockAudio();
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setPlaying(true);
    const beat = 60 / bpm;
    const lead = 0.08;
    const start = audioTime() + lead;
    cells.forEach((c, i) => {
      if (c.sound) scheduleClick(start + c.at * beat, c.at % 4 === 0, voice);
      timers.current.push(window.setTimeout(() => setCurrent(i), (lead + c.at * beat) * 1000));
    });
    timers.current.push(
      window.setTimeout(
        () => {
          setCurrent(null);
          setPlaying(false);
        },
        (lead + beats * beat) * 1000,
      ),
    );
  }

  return (
    <>
      {/* 4 cells per row on phones (8 squeezed the "sound"/"rest" labels into each other), 8 from sm up. */}
      <div
        className="grid grid-cols-[repeat(var(--cols-sm),minmax(0,1fr))] gap-1.5 sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        style={{ "--cols-sm": Math.min(cells.length, 4), "--cols": Math.min(cells.length, 8) } as React.CSSProperties}
      >
        {cells.map((c, i) => (
          <div key={i} className={cn("grid justify-items-center gap-1 rounded-md bg-card py-2 transition-colors", current === i && "bg-primary-soft ring-2 ring-primary")}>
            <NoteGlyph kind={c.kind} />
            <span className={cn("text-xs font-bold", c.sound ? "text-foreground" : "text-danger")}>{SYLLABLE[c.kind]}</span>
            <span className="text-[0.65rem] font-semibold text-muted-foreground uppercase">{c.sound ? t("sound") : t("rest")}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button size="sm" onClick={listen} disabled={playing}>
          <Play className="size-3.5" /> {t("Listen")}
        </Button>
        <label className="flex min-w-44 flex-1 items-center gap-2 text-xs font-semibold text-muted-foreground">
          {t("Tempo")} {bpm} BPM
          <input type="range" min={50} max={140} value={bpm} disabled={playing} onChange={(e) => setBpm(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {VOICES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVoice(v.id)}
              className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors", voice === v.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              {t(v.label)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** A melody on the read-only piano roll (which has its own Listen button) with its staff notation underneath. */
function MelodyExample({ notes }: { notes: string[] }) {
  const melody = useMemo(() => melodyFromSteps(notes.map((n) => (n === "-" ? null : noteToMidi(n))), "quarter"), [notes]);
  return (
    <>
      <PianoRoll length={melody.length} notes={melody.notes} />
      <div className="rounded-lg border bg-card p-2">
        <StaffNotation length={melody.length} notes={melody.notes} />
      </div>
    </>
  );
}
