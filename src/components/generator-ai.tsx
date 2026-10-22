"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, Pencil, Save, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { generateMaterialDraft, generateQuestionDraft, saveMaterialFromAi } from "@/app/actions/ai";
import { saveQuestionMany } from "@/app/actions/question";
import { Markdown } from "@/components/markdown";
import { QuestionForm, type QuestionDraft } from "@/components/question-form";
import { ChoiceLabel, SoundPlayer } from "@/components/sound-player";
import { TopicPicker } from "@/components/topic-picker";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption, type ProviderPick } from "@/components/provider-select";
import type { TopicSuggestions } from "@/lib/form-data";
import { QUESTION_TYPE_LABELS, formatAnswerKey, type QuestionInput } from "@/lib/questions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const LEVELS = ["Upper elementary", "Junior high", "SMA/SMK"] as const;
const TYPES = [
  { grade: "multiple_choice", label: "Multiple choice" },
  { grade: "true_false", label: "True / false" },
  { grade: "fill_in", label: "Fill in" },
  { grade: "midi", label: "MIDI piano" },
  { grade: "listen_notes", label: "Listening: guess the note" },
  { grade: "listen_tempo", label: "Listening: tempo" },
  { grade: "listen_rhythm", label: "Listening: rhythm" },
  { grade: "listen_solfege", label: "Listening: solfège" },
] as const;

type Draft = { id: number; data: QuestionInput; choose: boolean; edit: boolean };

export function AiGenerator({ providers, remainingInitial, limit, topicSuggestions }: { providers: ProviderOption[]; remainingInitial: number; limit: number; topicSuggestions: TopicSuggestions }) {
  const t = useT();
  const [pick, setPick] = useProviderPick();
  const anyProvider = providers.some((o) => o.available);
  const available = providerReady(providers, pick);
  const [tab, setTab] = useState<"question" | "material">("question");
  const [remaining, setRemaining] = useState(remainingInitial);

  return (
    <div className="grid gap-5">
      {!anyProvider && (
        <Alert kind="warning" title={t("AI is not enabled yet")}>
          {t("Install Claude Code on the server and log in, or set")} <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> {t("or")} <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> {t("in the server settings (see the README), then restart the app.")}
        </Alert>
      )}
      {anyProvider && !available && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1 text-sm font-semibold">
          {(
            [
              ["question", t("Create Questions")],
              ["material", t("Create Lessons & Summaries")],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded-md px-4 py-2", tab === k && "bg-card shadow-xs")}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ProviderSelect options={providers} value={pick} onChange={setPick} />
          <Badge tone={remaining > 0 ? "primary" : "danger"}>
            {t("Remaining today:")} {remaining}/{limit}
          </Badge>
        </div>
      </div>
      {tab === "question" ? (
        <QuestionsTab available={available} provider={pick} setRemaining={setRemaining} topicSuggestions={topicSuggestions} />
      ) : (
        <MaterialTab available={available} provider={pick} setRemaining={setRemaining} topicSuggestions={topicSuggestions} />
      )}
    </div>
  );
}

/* ---------------------------- Question ---------------------------- */

function QuestionsTab({ available, provider, setRemaining, topicSuggestions }: { available: boolean; provider: ProviderPick; setRemaining: (n: number) => void; topicSuggestions: TopicSuggestions }) {
  const t = useT();
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Junior high");
  const [type, setType] = useState<string[]>(["multiple_choice", "true_false"]);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [membuat, startCreate] = useTransition();
  const [menyimpan, startSave] = useTransition();
  const [saved, setSaved] = useState(0);

  function create() {
    setError("");
    setInfo("");
    setSaved(0);
    startCreate(async () => {
      const r = await generateQuestionDraft({ topic, count, level, type, note: note || undefined, provider });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not create the questions."));
      setDraft(r.data.draft.map((d, i) => ({ id: i, data: d, choose: true, edit: false })));
      setRemaining(r.data.remaining);
      if (r.data.discarded > 0) setInfo(t("{0} questions from the AI were discarded because their format was invalid or their answer key did not match the sound.", r.data.discarded));
    });
  }

  function save() {
    const selected = draft.filter((d) => d.choose).map((d) => d.data);
    if (!selected.length) return void toast.error(t("Choose at least one question."));
    startSave(async () => {
      const r = await saveQuestionMany(selected);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setSaved(r.data?.count ?? 0);
      setDraft([]);
    });
  }

  const editDraft = (id: number, p: Partial<Draft>) => setDraft((a) => a.map((d) => (d.id === id ? { ...d, ...p } : d)));

  return (
    <div className="grid gap-5">
      <form
        className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Field label={t("Question topic")} htmlFor="ai-topic" hint={`${t("Example: major scales, tempo and dynamics, Indonesian percussion instruments")}. ${t("Pick a TP from Perangkat Ajar, or type your own.")}`}>
          <TopicPicker id="ai-topic" value={topic} onChange={setTopic} suggestions={topicSuggestions} maxLength={300} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Number of questions (1-15)")} htmlFor="ai-count">
            <Input id="ai-count" type="number" min={1} max={15} value={count} onChange={(e) => setCount(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} />
          </Field>
          <Field label={t("Level")} htmlFor="ai-level">
            <Select id="ai-level" value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(level)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{t("Question types")}</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((opt) => {
              const on = type.includes(opt.grade);
              return (
                <button
                  key={opt.grade}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setType((a) => (on ? a.filter((x) => x !== opt.grade) : [...a, opt.grade]))}
                  className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {t(opt.label)}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("Listening questions are played by the app (piano or beat clicks), no file needed. Questions with a recording or video are still made manually in the question bank.")}</p>
        </fieldset>
        <Field label={t("Extra notes (optional)")} htmlFor="ai-note">
          <Textarea id="ai-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t("E.g. focus on folk songs, avoid Italian terms")} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <div>
          <Button type="submit" size="lg" disabled={!available || membuat || type.length === 0 || topic.trim().length < 3}>
            {membuat ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {membuat ? t("The AI is writing questions… (can take up to 1 minute)") : t("Create question draft")}
          </Button>
        </div>
      </form>

      {saved > 0 && (
        <Alert kind="success" title={t("{0} questions saved to the question bank", saved)}>
          <Link href="/teacher/question-bank?view=recent" className="font-semibold text-primary hover:underline">
            {t("View question bank")}
          </Link>{" "}
          {t("or")}{" "}
          <Link href="/teacher/quizzes/new" className="font-semibold text-primary hover:underline">
            {t("create a quiz right away")}
          </Link>
          .
        </Alert>
      )}

      {draft.length > 0 && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">{t("AI drafts (")}{draft.length})</h2>
              <p className="text-sm text-muted-foreground">{t("Review each question. Edit if needed, then save the ones you approve. The AI can be wrong, so the teacher should still check the answer keys.")}</p>
            </div>
            <Button size="lg" onClick={save} disabled={menyimpan || !draft.some((d) => d.choose)}>
              {menyimpan ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save")} {draft.filter((d) => d.choose).length} {t("questions")}
            </Button>
          </div>
          {info && <Alert kind="info">{info}</Alert>}
          {draft.map((d, i) => (
            <div key={d.id} className={cn("rounded-xl border bg-card p-4 shadow-xs", !d.choose && "opacity-60")}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={d.choose} onChange={(e) => editDraft(d.id, { choose: e.target.checked })} className="size-5 accent-[var(--primary)]" aria-label={t("Select question {0}", i + 1)} />
                  <span className="font-bold">{t("Question")} {i + 1}</span>
                </label>
                <Badge tone={d.data.type === "midi" || d.data.type === "audio" ? "warning" : "neutral"}>{t(QUESTION_TYPE_LABELS[d.data.type])}</Badge>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => editDraft(d.id, { edit: !d.edit })}>
                  <Pencil /> {d.edit ? t("Closes") : t("Edit")}
                </Button>
              </div>
              {d.edit ? (
                <QuestionForm
                  question={d.data as unknown as QuestionDraft}
                  topicSuggestions={topicSuggestions}
                  onSave={(fresh) => {
                    editDraft(d.id, { data: fresh as unknown as QuestionInput, edit: false });
                    toast.success(t("Changes applied to the draft."));
                  }}
                />
              ) : (
                <DraftPreview s={d.data} />
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function DraftPreview({ s }: { s: QuestionInput }) {
  const t = useT();
  return (
    <div className="grid gap-2 text-sm">
      <p className="text-base font-semibold">{s.prompt}</p>
      {s.sound && <SoundPlayer sound={s.sound} reveal />}
      {s.answerType === "multiple_choice" && (
        <ul className="grid gap-1">
          {(s.options ?? []).map((o, i) => {
            const correct = s.answerKey.kind === "multiple_choice" && s.answerKey.correct === i;
            return (
              <li key={i} className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", correct ? "bg-success-soft font-semibold" : "bg-muted/50")}>
                <span className="font-bold">{String.fromCharCode(65 + i)}.</span> <ChoiceLabel text={o} sound={s.sound} /> {correct && <CircleCheck className="ml-auto size-4 text-success" />}
              </li>
            );
          })}
        </ul>
      )}
      {s.answerType !== "multiple_choice" && (
        <p className="rounded-lg bg-success-soft px-3 py-1.5">
          <b>{t("Key:")}</b> {formatAnswerKey(s.answerKey, undefined, t)}
        </p>
      )}
      {s.explanation && <p className="text-muted-foreground">💡 {s.explanation}</p>}
    </div>
  );
}

/* ------------------------------ Lesson ------------------------------ */

function MaterialTab({ available, provider, setRemaining, topicSuggestions }: { available: boolean; provider: ProviderPick; setRemaining: (n: number) => void; topicSuggestions: TopicSuggestions }) {
  const t = useT();
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Junior high");
  const [kind, setKind] = useState<"material" | "summary">("material");
  const [length, setLength] = useState<"short" | "medium" | "long" | "auto">("medium");
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [membuat, startCreate] = useTransition();
  const [menyimpan, startSave] = useTransition();

  function create() {
    setError("");
    startCreate(async () => {
      const r = await generateMaterialDraft({ topic, level, kind, length, note: note || undefined, provider });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not create the lesson."));
      setTitle(r.data.title);
      setContent(r.data.content);
      setPreview(false);
      setRemaining(r.data.remaining);
    });
  }

  function save() {
    startSave(async () => {
      const r = await saveMaterialFromAi({ title, content, topic });
      if (!r.ok || !r.data) return void toast.error(r.error);
      toast.success(t("Lesson saved. Assign it to a class on this page."));
      router.push(`/teacher/materials/${r.data.id}`);
    });
  }

  return (
    <div className="grid gap-5">
      <form
        className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Field label={t("Topic")} htmlFor="m-topic" hint={`${t("Example: time signatures and beats, history of gamelan, reading staff notation")}. ${t("Pick a TP from Perangkat Ajar, or type your own.")}`}>
          <TopicPicker id="m-topic" value={topic} onChange={setTopic} suggestions={topicSuggestions} maxLength={300} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("Type")} htmlFor="m-kind">
            <Select id="m-kind" value={kind} onChange={(e) => setKind(e.target.value as "material" | "summary")}>
              <option value="material">{t("Lesson")}</option>
              <option value="summary">{t("Summary")}</option>
            </Select>
          </Field>
          <Field label={t("Level")} htmlFor="m-level">
            <Select id="m-level" value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(level)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Length")} htmlFor="m-length">
            <Select id="m-length" value={length} onChange={(e) => setLength(e.target.value as "short" | "medium" | "long" | "auto")}>
              <option value="auto">{t("Automatic (AI decides)")}</option>
              <option value="short">{t("Short (~200 words)")}</option>
              <option value="medium">{t("Medium (~450 words)")}</option>
              <option value="long">{t("Detailed (~800 words)")}</option>
            </Select>
          </Field>
        </div>
        <Field label={t("Extra notes (optional)")} htmlFor="m-note">
          <Textarea id="m-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <div>
          <Button type="submit" size="lg" disabled={!available || membuat || topic.trim().length < 3}>
            {membuat ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {membuat ? t("The AI is writing…") : t("Create draft")}
          </Button>
        </div>
      </form>

      {content && (
        <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
          <div>
            <h2 className="text-lg font-bold">{t("AI draft")}</h2>
            <p className="text-sm text-muted-foreground">{t("Read and edit before saving. Markdown format.")}</p>
          </div>
          <Field label={t("Title")} htmlFor="d-title">
            <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="d-content" className="text-sm font-semibold">
                {t("Set")}
              </label>
              <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
                <button type="button" onClick={() => setPreview(false)} className={cn("rounded-md px-3 py-1", !preview && "bg-card shadow-xs")}>
                  {t("Write")}
                </button>
                <button type="button" onClick={() => setPreview(true)} className={cn("rounded-md px-3 py-1", preview && "bg-card shadow-xs")}>
                  {t("Preview")}
                </button>
              </div>
            </div>
            {preview ? (
              <div className="min-h-48 rounded-lg border p-4">
                <Markdown>{content}</Markdown>
              </div>
            ) : (
              <Textarea id="d-content" value={content} onChange={(e) => setContent(e.target.value)} rows={16} className="font-mono text-[0.9rem]" />
            )}
          </div>
          <div>
            <Button size="lg" onClick={save} disabled={menyimpan || title.trim().length < 3 || content.trim().length < 10}>
              {menyimpan ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save as lesson")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
