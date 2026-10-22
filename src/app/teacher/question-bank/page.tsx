import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { Clock, FileQuestionMark, FolderTree, Pencil, Plus, Search, WandSparkles } from "lucide-react";
import { deleteQuestion } from "@/app/actions/question";
import { DeleteButton } from "@/components/delete-button";
import { QuestionBadges } from "@/components/question-badges";
import { AutoFillMetaNotice, BulkCheckbox, QuestionBulkEditor } from "@/components/question-bulk";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, formatAnswerKey } from "@/lib/questions";
import { requireTeacher } from "@/lib/session";
import { addDays, cn, shortLabel, today } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Question Bank") };
}
const S = schema;


const dayKey = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(d);
const timeOf = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(d);
const dateLabel = (key: string) => key.split("-").reverse().join("/");

type Params = { q?: string; type?: string; topic?: string; kelas?: string; semester?: string; view?: string };

export default async function QuestionBank({ searchParams }: { searchParams: Promise<Params> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const params = await searchParams;
  const { q, type, topic, kelas, semester } = params;
  /** "topic" = grouped by TP/topic (default), "recent" = newest first, grouped by the day they were made. */
  const view = params.view === "recent" ? "recent" : "topic";
  const typeValid = QUESTION_TYPES.find((x) => x === type);
  const semesterValid = semester === "1" || semester === "2" ? Number(semester) : null;

  const [{ missing }] = await db
    .select({ missing: count() })
    .from(S.question)
    .where(and(eq(S.question.teacherId, teacher.id), or(isNull(S.question.kelas), isNull(S.question.semester))));
  const allMeta = await db.selectDistinct({ t: S.question.topic, kelas: S.question.kelas }).from(S.question).where(eq(S.question.teacherId, teacher.id));
  const topicList = [...new Set(allMeta.map((x) => x.t).filter((x): x is string => Boolean(x)))].sort();
  const kelasList = [...new Set(allMeta.map((x) => x.kelas).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const list = await db
    .select()
    .from(S.question)
    .where(
      and(
        eq(S.question.teacherId, teacher.id),
        typeValid ? eq(S.question.type, typeValid) : undefined,
        topic ? (topic === "without" ? isNull(S.question.topic) : eq(S.question.topic, topic)) : undefined,
        kelas ? (kelas === "without" ? isNull(S.question.kelas) : eq(S.question.kelas, kelas)) : undefined,
        semester === "without" ? isNull(S.question.semester) : semesterValid ? eq(S.question.semester, semesterValid) : undefined,
        q ? ilike(S.question.prompt, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
      ),
    )
    .orderBy(desc(S.question.createdAt));
  const show = topic === "without" ? list.filter((d) => !d.topic) : list;
  const filtering = Boolean(q || typeValid || topic || kelas || semester);

  const ids = show.map((d) => d.id);
  const usage = ids.length ? await db.select({ questionId: S.quizQuestion.questionId }).from(S.quizQuestion).where(inArray(S.quizQuestion.questionId, ids)) : [];

  const noTopic = t("No topic");
  const group = new Map<string, typeof show>();
  if (view === "recent") {
    // `show` is already newest first, so the days come out newest first too.
    const todayKey = today();
    const yesterdayKey = addDays(todayKey, -1);
    for (const s of show) {
      const key = dayKey(s.createdAt);
      const label = key === todayKey ? t("Today") : key === yesterdayKey ? t("Yesterday") : dateLabel(key);
      group.set(label, [...(group.get(label) ?? []), s]);
    }
  } else {
    for (const s of show) {
      const k = s.topic ?? noTopic;
      group.set(k, [...(group.get(k) ?? []), s]);
    }
  }
  const position = view === "recent" ? [...group.entries()] : [...group.entries()].sort(([a], [b]) => (a === noTopic ? 1 : b === noTopic ? -1 : a.localeCompare(b)));
  const now = Date.now();
  const viewHref = (v: "topic" | "recent") => {
    const sp = new URLSearchParams(Object.entries({ ...params, view: v === "recent" ? "recent" : undefined }).filter((e): e is [string, string] => Boolean(e[1])));
    const qs = sp.toString();
    return `/teacher/question-bank${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title={t("Question Bank")}
        description={t("A collection of questions you can group by topic and reuse across many quizzes.")}
        action={
          <>
            <Button asChild variant="secondary">
              <Link href="/teacher/ai-generator">
                <WandSparkles /> {t("Create with AI")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/teacher/question-bank/new">
                <Plus /> {t("New question")}
              </Link>
            </Button>
          </>
        }
      />

      <form className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-[minmax(10rem,1fr)_auto_minmax(0,11rem)_auto_auto_auto]">
        <div className="relative col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder={t("Search questions…")} className="pl-9" aria-label={t("Search questions")} />
        </div>
        <Select name="type" defaultValue={typeValid ?? ""} aria-label={t("Filter by type")}>
          <option value="">{t("All types")}</option>
          {QUESTION_TYPES.map((x) => (
            <option key={x} value={x}>
              {t(QUESTION_TYPE_LABELS[x])}
            </option>
          ))}
        </Select>
        <Select name="topic" defaultValue={topic ?? ""} aria-label={t("Filter by topic")}>
          <option value="">{t("All topics")}</option>
          {topicList.map((x) => (
            <option key={x} value={x} title={x}>
              {shortLabel(x)}
            </option>
          ))}
          <option value="without">{t("No topic")}</option>
        </Select>
        <Select name="kelas" defaultValue={kelas ?? ""} aria-label={t("Filter by class")}>
          <option value="">{t("All classes")}</option>
          {kelasList.map((x) => (
            <option key={x} value={x}>
              {t("Class {0}", x)}
            </option>
          ))}
          <option value="without">{t("No class")}</option>
        </Select>
        <Select name="semester" defaultValue={semester ?? ""} aria-label={t("Filter by semester")}>
          <option value="">{t("All semesters")}</option>
          <option value="1">{t("Semester 1")}</option>
          <option value="2">{t("Semester 2")}</option>
          <option value="without">{t("No semester")}</option>
        </Select>
        {view === "recent" && <input type="hidden" name="view" value="recent" />}
        <Button type="submit" variant="outline">
          {t("Apply")}
        </Button>
      </form>

      <nav aria-label={t("Arrange questions")} className="mb-5 inline-flex rounded-lg bg-muted p-1 text-sm font-semibold">
        {(
          [
            ["topic", <FolderTree key="i" className="size-4" />, t("By topic")],
            ["recent", <Clock key="i" className="size-4" />, t("Newest")],
          ] as const
        ).map(([v, icon, label]) => (
          <Link
            key={v}
            href={viewHref(v)}
            aria-current={view === v ? "page" : undefined}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground", view === v && "bg-card text-foreground shadow-xs")}
          >
            {icon} {label}
          </Link>
        ))}
      </nav>

      {missing > 0 && <AutoFillMetaNotice missing={missing} />}

      {show.length === 0 ? (
        <EmptyState icon={<FileQuestionMark />} title={filtering ? t("No matching questions") : t("The question bank is empty")}>
          {t("Create questions manually or ask the AI to draft questions from a topic.")}
        </EmptyState>
      ) : (
        <QuestionBulkEditor ids={position.flatMap(([, qs]) => qs.map((x) => x.id))} kelasOptions={kelasList}>
        <div className="grid gap-7">
          {position.map(([topicName, topicQuestion]) => (
            <section key={topicName}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
                {topicName} <Badge>{topicQuestion.length}</Badge>
              </h2>
              <div className="grid gap-2">
                {topicQuestion.map((s) => {
                  const used = usage.filter((p) => p.questionId === s.id).length;
                  return (
                    <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-xs">
                      <BulkCheckbox id={s.id} />
                      {/* Basis 16rem: on a phone the edit/delete buttons wrap under the question instead of squeezing it. */}
                      <div className="min-w-0 flex-[1_1_16rem]">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <QuestionBadges q={s} t={t} now={now} usedIn={used} />
                          {view === "recent" && (
                            <span className="text-xs break-words text-muted-foreground">
                              {t("made at {0}", timeOf(s.createdAt))}
                              {s.topic && ` · ${s.topic}`}
                            </span>
                          )}
                        </div>
                        <Link href={`/teacher/question-bank/${s.id}`} className={cn("line-clamp-2 font-semibold hover:text-primary")}>
                          {s.prompt}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{t("Key:")} {s.answerKey ? formatAnswerKey(s.answerKey, s.options, t) : "-"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/teacher/question-bank/${s.id}`}>
                            <Pencil /> {t("Edit")}
                          </Link>
                        </Button>
                        <DeleteButton action={deleteQuestion} id={s.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        </QuestionBulkEditor>
      )}
    </>
  );
}
