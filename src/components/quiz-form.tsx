"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { saveQuiz } from "@/app/actions/quiz";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { QuestionBadges, type QuestionBadgeInfo } from "@/components/question-badges";
import { QUESTION_TYPE_LABELS, formatAnswerKey, type AnswerKey, type QuestionType } from "@/lib/questions";
import { shortLabel } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type QuestionSummary = QuestionBadgeInfo & {
  id: string;
  prompt: string;
  topic: string | null;
  options: string[] | null;
  answerKey: AnswerKey | null;
  /** ISO time the question was made. */
  createdAt: string;
  /** Number of quizzes that already use this question. */
  usedIn: number;
};

export type QuizDraft = {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  startsAt: string; // datetime-local input format (WIB)
  endsAt: string;
  durationMinutes: number | null;
  maxAttempts: number;
  instantFeedback: boolean;
  published: boolean;
  questionIds: string[];
};

export function QuizForm({
  classroom,
  bank,
  quiz,
  initialClassroom,
  alreadyTaken,
}: {
  classroom: { id: string; name: string }[];
  bank: QuestionSummary[];
  quiz?: QuizDraft;
  initialClassroom?: string;
  alreadyTaken?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState(quiz?.title ?? "");
  const [description, setDescription] = useState(quiz?.description ?? "");
  const [classroomId, setClassroomId] = useState(quiz?.classroomId ?? initialClassroom ?? classroom[0]?.id ?? "");
  // Classes that get this quiz. New quiz: every checked class. Edit: extra classes that get a copy.
  const [targets, setTargets] = useState<string[]>(() => (quiz ? [] : classroomId ? [classroomId] : []));
  const toggleTarget = (id: string) => setTargets((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  // Keep the class list order so the first checked class becomes the main quiz.
  const checked = classroom.map((k) => k.id).filter((id) => targets.includes(id));
  const mainClassroom = quiz ? classroomId : (checked[0] ?? "");
  const extraClassrooms = checked.filter((id) => id !== mainClassroom);
  const pickable = quiz ? classroom.filter((k) => k.id !== classroomId) : classroom;
  const [start, setStart] = useState(quiz?.startsAt ?? "");
  const [completed, setCompleted] = useState(quiz?.endsAt ?? "");
  const [duration, setDuration] = useState<string>(quiz?.durationMinutes ? String(quiz.durationMinutes) : "");
  const [max, setMax] = useState(quiz?.maxAttempts ?? 1);
  const [instant, setInstant] = useState(quiz?.instantFeedback ?? true);
  const [selected, setSelected] = useState<string[]>(quiz?.questionIds ?? []);
  const [search, setSearch] = useState("");
  const [fTopic, setFTopic] = useState("");
  const [fType, setFType] = useState("");
  const [fKelas, setFKelas] = useState("");
  const [fSemester, setFSemester] = useState("");
  const [sort, setSort] = useState<"topic" | "recent">("topic");
  const [now] = useState(() => Date.now());
  const [error, setError] = useState<Record<string, string>>({});
  const [errorUmum, setErrorUmum] = useState("");
  const [busy, startTransition] = useTransition();

  const bankMap = useMemo(() => new Map(bank.map((b) => [b.id, b])), [bank]);
  const topic = useMemo(() => [...new Set(bank.map((b) => b.topic).filter((x): x is string => Boolean(x)))].sort(), [bank]);
  const kelasList = useMemo(
    () => [...new Set(bank.map((b) => b.kelas).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [bank],
  );
  const filtered = bank
    .filter(
    (b) =>
      !selected.includes(b.id) &&
      (!fTopic || (fTopic === "without" ? !b.topic : b.topic === fTopic)) &&
      (!fType || b.type === fType) &&
      (!fKelas || (fKelas === "without" ? !b.kelas : b.kelas === fKelas)) &&
      (!fSemester || (fSemester === "without" ? !b.semester : String(b.semester) === fSemester)) &&
      (!search || b.prompt.toLowerCase().includes(search.toLowerCase())),
    )
    .sort((a, b) => (sort === "recent" ? b.createdAt.localeCompare(a.createdAt) : 0));
  const totalPoints = selected.reduce((a, id) => a + (bankMap.get(id)?.points ?? 0), 0);

  const move = (i: number, arah: -1 | 1) =>
    setSelected((a) => {
      const j = i + arah;
      if (j < 0 || j >= a.length) return a;
      const b = [...a];
      [b[i], b[j]] = [b[j], b[i]];
      return b;
    });

  function save(published: boolean) {
    setError({});
    setErrorUmum("");
    startTransition(async () => {
      const r = await saveQuiz(
        {
          classroomId: mainClassroom,
          extraClassroomIds: extraClassrooms,
          title,
          description: description || null,
          startsAt: start || null,
          endsAt: completed || null,
          durationMinutes: duration ? Number(duration) : null,
          maxAttempts: max,
          instantFeedback: instant,
          published,
          questionIds: selected,
        },
        quiz?.id,
      );
      if (!r.ok) {
        setError(r.fieldErrors ?? {});
        setErrorUmum(r.error ?? t("Could not save."));
        toast.error(r.error ?? t("Could not save."));
        return;
      }
      toast.success(r.message);
      router.push(`/teacher/quizzes/${r.data!.id}`);
      router.refresh();
    });
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(quiz?.published ?? false);
      }}
    >
      {alreadyTaken && (
        <Alert kind="warning" title={t("Students have taken this quiz")}>
          {t("Changing the question list does not recalculate saved grades. Avoid removing questions that have been answered.")}
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Quiz title")} htmlFor="title" error={error.title} className="sm:col-span-2">
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label={t("Description / instructions (optional)")} htmlFor="description" className="sm:col-span-2">
          <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {quiz && (
          <Field label={t("Classes")} htmlFor="classroom" error={error.classroomId}>
            <Select id="classroom" value={classroomId} onChange={(e) => setClassroomId(e.target.value)} required>
              {classroom.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {(!quiz || pickable.length > 0) && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-semibold">{quiz ? t("Also send to other classes") : t("Send to classes")}</legend>
            <p className="mb-2 text-xs text-muted-foreground">
              {quiz
                ? t("Each checked class gets its own copy of this quiz when you save. Later changes here do not update the copies.")
                : t("Each class gets its own copy of the quiz, so grades and attempts stay separate per class.")}
            </p>
            {classroom.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("Create a class first, under Classes & Students.")}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {pickable.map((k) => {
                  const on = targets.includes(k.id);
                  return (
                    <label
                      key={k.id}
                      className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3 ${on ? "border-primary bg-primary-soft/50" : ""}`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleTarget(k.id)} className="size-5 shrink-0 accent-[var(--primary)]" />
                      <span className="min-w-0 break-words font-semibold">{k.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {!quiz && error.classroomId && <p className="mt-1 text-sm font-medium text-danger">{error.classroomId}</p>}
            {checked.length > 1 && <p className="mt-2 text-xs font-medium text-primary">{t("{0} classes selected", checked.length)}</p>}
          </fieldset>
        )}
        <Field label={t("Duration (minutes, optional)")} htmlFor="duration" hint={t("Leave empty for no time limit")}>
          <Input id="duration" type="number" min={1} max={240} value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label={t("Opens at (WIB, optional)")} htmlFor="start" hint={t("Leave empty = opens as soon as it is published")}>
          <Input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t("Closes at (WIB, optional)")} htmlFor="completed" error={error.endsAt}>
          <Input id="completed" type="datetime-local" value={completed} onChange={(e) => setCompleted(e.target.value)} />
        </Field>
        <Field label={t("Maximum attempts per student")} htmlFor="max" hint={t("The best attempt is the one that counts")}>
          <Input id="max" type="number" min={1} max={10} value={max} onChange={(e) => setMax(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 self-end rounded-lg border p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={instant} onChange={(e) => setInstant(e.target.checked)} />
          <span>
            <b>{t("Instant feedback")}</b>
            <span className="block text-xs text-muted-foreground">{t("Students see whether they were right and the explanation after each question. Answers lock once checked.")}</span>
          </span>
        </label>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">{t("Questions (")}{selected.length}) </h2>
          <Badge tone="primary">{t("Total")} {totalPoints} {t("points")}</Badge>
        </div>
        {error.questionIds && <p className="mb-2 text-sm font-medium text-danger">{error.questionIds}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Selected */}
          <div className="rounded-xl border bg-card">
            <p className="border-b px-3 py-2 text-xs font-bold text-muted-foreground uppercase">{t("Question order in the quiz")}</p>
            {selected.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t("Add questions from the question bank next to it.")}</p>
            ) : (
              <ol className="divide-y">
                {selected.map((id, i) => {
                  const s = bankMap.get(id);
                  if (!s) return null;
                  return (
                    <li key={id} className="flex items-center gap-2 p-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words">{s.prompt}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <QuestionBadges q={s} t={t} now={now} />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="size-8" aria-label={t("Move up")} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" aria-label={t("Move down")} disabled={i === selected.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-danger" aria-label={t("Remove")} onClick={() => setSelected((a) => a.filter((x) => x !== id))}>
                        <X />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Bank */}
          <div className="rounded-xl border bg-card">
            <div className="grid grid-cols-2 gap-2 border-b p-2.5 sm:grid-cols-4">
              <div className="relative col-span-2 sm:col-span-4">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search the question bank…")} className="h-9 pl-8" aria-label={t("Search questions")} />
              </div>
              <Select value={fTopic} onChange={(e) => setFTopic(e.target.value)} className="h-9" aria-label={t("Filter by topic")}>
                <option value="">{t("All topics")}</option>
                {topic.map((x) => (
                  <option key={x} value={x} title={x}>
                    {shortLabel(x)}
                  </option>
                ))}
                <option value="without">{t("No topic")}</option>
              </Select>
              <Select value={fType} onChange={(e) => setFType(e.target.value)} className="h-9" aria-label={t("Filter by type")}>
                <option value="">{t("All types")}</option>
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((x) => (
                  <option key={x} value={x}>
                    {t(QUESTION_TYPE_LABELS[x])}
                  </option>
                ))}
              </Select>
              <Select value={fKelas} onChange={(e) => setFKelas(e.target.value)} className="h-9" aria-label={t("Filter by class")}>
                <option value="">{t("All classes")}</option>
                {kelasList.map((x) => (
                  <option key={x} value={x}>
                    {t("Class {0}", x)}
                  </option>
                ))}
                <option value="without">{t("No class")}</option>
              </Select>
              <Select value={fSemester} onChange={(e) => setFSemester(e.target.value)} className="h-9" aria-label={t("Filter by semester")}>
                <option value="">{t("All semesters")}</option>
                <option value="1">{t("Semester 1")}</option>
                <option value="2">{t("Semester 2")}</option>
                <option value="without">{t("No semester")}</option>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">{t("{0} questions", filtered.length)}</span>
              <div className="inline-flex rounded-md bg-muted p-0.5 text-xs font-semibold" role="group" aria-label={t("Arrange questions")}>
                {(
                  [
                    ["topic", t("By topic")],
                    ["recent", t("Newest")],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={sort === v}
                    onClick={() => setSort(v)}
                    className={sort === v ? "rounded bg-card px-2.5 py-1 shadow-xs" : "rounded px-2.5 py-1 text-muted-foreground"}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="max-h-[32rem] divide-y overflow-y-auto">
              {filtered.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">{bank.length === 0 ? t("The question bank is empty. Create questions first.") : t("No matching questions.")}</li>
              )}
              {filtered.map((s) => (
                <li key={s.id} className="flex items-start gap-2 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1">
                      <QuestionBadges q={s} t={t} now={now} usedIn={s.usedIn} />
                    </div>
                    <p className="text-sm font-medium break-words">{s.prompt}</p>
                    <p className="mt-0.5 text-xs break-words text-muted-foreground">
                      {t("Key:")} {s.answerKey ? formatAnswerKey(s.answerKey, s.options, t) : "-"}
                    </p>
                    {s.topic && <p className="mt-0.5 text-xs break-words text-muted-foreground">{s.topic}</p>}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setSelected((a) => [...a, s.id])}>
                    <Plus /> {t("Add")}
                  </Button>
                </li>
              ))}
            </ul>
            {filtered.length > 1 && (
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected((a) => [...a, ...filtered.map((s) => s.id)])}>
                  {t("Add all shown (")}{filtered.length})
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      {errorUmum && <Alert kind="error">{errorUmum}</Alert>}
      {/* Not sticky: a floating bar covered the question lists while scrolling. */}
      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3">
        {quiz?.published ? (
          <>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t("Saving…") : t("Save changes")}
            </Button>
            <Button size="lg" variant="outline" disabled={busy} onClick={() => save(false)}>
              {t("Move back to draft")}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="lg" disabled={busy} onClick={() => save(true)}>
              {busy ? t("Saving…") : t("Save & publish")}
            </Button>
            <Button size="lg" variant="outline" type="submit" disabled={busy}>
              {t("Save as draft")}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
