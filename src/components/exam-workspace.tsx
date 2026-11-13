"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleCheck, Download, ImageIcon, ImageOff, ImagePlus, FileSpreadsheet, Library, ListPlus, LoaderCircle, Pencil, Plus, Search, Send, Settings2, Sparkles, Trash, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { addExamItem, deleteExam, deleteExamItem, dismissExamError, examJobStatus, fillExamFromQuiz, linkExamQuestion, publishExam, saveExamItem, setOptionImage, setQuestionImage, startGambar, startKisi, startSoal } from "@/app/actions/exam";
import { DeleteButton } from "@/components/delete-button";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { COGNITIVE_LEVELS, EXAM_SECTIONS, SECTION_META, letter, pointsPerQuestion, totalCount, type ExamComposition, type ExamInfo, type ExamSection } from "@/lib/exam";
import { mediaUrl, type AnswerKey, type QuestionType } from "@/lib/questions";
import type { Notation } from "@/lib/notation";
import { notationPng, uploadMedia } from "@/lib/notation-render";
import { MediaUploader } from "@/components/media-uploader";
import { AiImagePanel, type ImageTarget } from "@/components/ai-image-panel";
import type { ImageReady } from "@/lib/ai";
import { NotationPreview } from "@/components/notation-editor";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type WorkspaceQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[] | null;
  optionImages: (string | null)[] | null;
  matchRows: string[] | null;
  answerKey: AnswerKey | null;
  explanation: string | null;
  mediaKey: string | null;
  notation: Notation | null;
  imageHint: string | null;
};
export type WorkspaceItem = { id: string; section: ExamSection; tp: string; materi: string; indikator: string; level: string; question: WorkspaceQuestion | null };
type BankQuestion = { id: string; type: QuestionType; prompt: string; topic: string | null; kelas: string | null; level: string | null };
type ExamView = { id: string; title: string; info: ExamInfo; tps: string[]; composition: ExamComposition; job: string | null; jobError: string | null };

type Tab = "kisi" | "soal" | "publish";
const POLL_MS = 3000;

export function ExamWorkspace({
  exam,
  items,
  bank,
  quizzes,
  classrooms,
  linked,
  providers,
  imageAi,
}: {
  exam: ExamView;
  items: WorkspaceItem[];
  bank: BankQuestion[];
  quizzes: { id: string; title: string; classroomName: string; n: number }[];
  classrooms: { id: string; name: string }[];
  linked: { id: string; title: string; published: boolean; classroomName: string; attempts: number }[];
  providers: ProviderOption[];
  /** Which AI pictures the teacher can make. */
  imageAi: ImageReady;
}) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => (items.length === 0 ? "kisi" : items.every((i) => i.question) ? "publish" : items.some((i) => i.question) ? "soal" : "kisi"));
  const [job, setJob] = useState<string | null>(exam.job);
  const [progress, setProgress] = useState<{ filled: number; total: number } | null>(null);
  const [pick, setPick] = useProviderPick();
  const [catatan, setCatatan] = useState("");
  const [withImages, setWithImages] = useState(true);
  const [busy, start] = useTransition();
  const [drawing, setDrawing] = useState<{ done: number; total: number } | null>(null);
  const tried = useRef(new Set<string>());

  // Notation the AI (or the teacher) wrote but that is not an image yet: draw it here in the browser, upload the PNG,
  // and make it the question image. Runs once per question; a failure is reported and left for the teacher.
  const pendingDrawings = items.map((i) => i.question).filter((q): q is WorkspaceQuestion => Boolean(q?.notation && !q.mediaKey && !tried.current.has(q.id)));
  const pendingKey = pendingDrawings.map((q) => q.id).join(",");
  useEffect(() => {
    if (job || drawing || pendingDrawings.length === 0) return;
    const list = pendingDrawings;
    list.forEach((q) => tried.current.add(q.id));
    void (async () => {
      setDrawing({ done: 0, total: list.length });
      let failed = 0;
      for (let n = 0; n < list.length; n++) {
        try {
          const key = await uploadMedia(await notationPng(list[n].notation!));
          const r = await setQuestionImage(list[n].id, key);
          if (!r.ok) failed++;
        } catch {
          failed++;
        }
        setDrawing({ done: n + 1, total: list.length });
      }
      setDrawing(null);
      if (failed) toast.warning(t("{0} notation images could not be drawn. Open the question to fix its notation.", failed));
      else toast.success(t("{0} notation images added to the questions.", list.length));
      router.refresh();
    })();
    // Runs when the set of undrawn questions changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, job]);

  // Follow the server's job state after a refresh.
  useEffect(() => setJob(exam.job), [exam.job]);

  // Poll while the AI works; refresh the page when it is done.
  useEffect(() => {
    if (!job) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const r = await examJobStatus(exam.id).catch(() => null);
      if (stopped) return;
      if (r?.ok && r.data) {
        setProgress({ filled: r.data.filled, total: r.data.total });
        if (!r.data.job) {
          setJob(null);
          if (r.data.jobError) toast.warning(t(r.data.jobError));
          else toast.success(job === "kisi" ? t("The blueprint is ready. Check and edit it.") : job === "gambar" ? t("The AI chose the questions that get an image.") : t("The questions are ready. Check them."));
          if (job === "kisi") setTab("kisi");
          router.refresh();
          return;
        }
      }
      timer = setTimeout(tick, POLL_MS);
    }
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // router and t are stable enough; restarting the poll on them is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, exam.id]);

  const comp = exam.composition;
  const bySection = useMemo(() => {
    let no = 0;
    return EXAM_SECTIONS.map((s) => ({ section: s, items: items.filter((i) => i.section === s).map((i) => ({ ...i, no: ++no })) }));
  }, [items]);
  const filled = items.filter((i) => i.question).length;
  const noProvider = !providerReady(providers, pick);

  function run(kind: "kisi" | "soal" | "gambar") {
    start(async () => {
      const r =
        kind === "kisi"
          ? await startKisi(exam.id, { provider: pick, catatan })
          : kind === "soal"
            ? await startSoal(exam.id, { provider: pick, catatan, gambar: withImages })
            : await startGambar(exam.id, { provider: pick });
      if (!r.ok) return void toast.error(r.error ?? t("Could not start the generation."));
      setProgress(null);
      setJob(kind);
      router.refresh();
    });
  }

  const tabs: { id: Tab; label: string; badge: string }[] = [
    { id: "kisi", label: t("1. Blueprint (kisi-kisi)"), badge: String(items.length) },
    { id: "soal", label: t("2. Questions"), badge: `${filled}/${items.length}` },
    { id: "publish", label: t("3. Download & publish"), badge: linked.length ? String(linked.length) : "" },
  ];

  return (
    <div className="grid gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold break-words">{exam.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[exam.info.jenis_ujian, exam.info.mata_pelajaran, exam.info.kelas && t("Class {0}", exam.info.kelas), exam.info.semester, exam.info.tahun_ajaran].filter(Boolean).join(" · ") || t("No identity yet")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/teacher/exams/${exam.id}/edit`}>
              <Settings2 /> {t("Settings, TP & weights")}
            </Link>
          </Button>
          <DeleteButton action={deleteExam} id={exam.id} label={t("Delete exam")} onDone={() => router.push("/teacher/exams")} />
        </div>
      </div>

      {/* Composition summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {EXAM_SECTIONS.map((s) => {
          const rows = bySection.find((g) => g.section === s)!.items;
          const done = rows.filter((r) => r.question).length;
          const off = items.length > 0 && rows.length !== comp[s].count;
          if (comp[s].count === 0 && rows.length === 0) return null;
          return (
            <div key={s} className="rounded-xl border bg-card p-3">
              <p className="text-xs font-bold text-muted-foreground">{t(SECTION_META[s].label)}</p>
              <p className="mt-0.5 text-lg font-extrabold">
                {done}/{rows.length || comp[s].count}
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">· {comp[s].weight}%</span>
              </p>
              {off && <p className="text-xs font-semibold text-warning">{t("Planned {0}, blueprint {1}", comp[s].count, rows.length)}</p>}
            </div>
          );
        })}
        <div className="rounded-xl border bg-muted/50 p-3">
          <p className="text-xs font-bold text-muted-foreground">{t("TP tested")}</p>
          <p className="mt-0.5 text-lg font-extrabold">{exam.tps.length}</p>
        </div>
      </div>

      {/* Job state */}
      {job && (
        <Alert kind="info" title={job === "kisi" ? t("The AI is writing the blueprint…") : job === "gambar" ? t("The AI is choosing questions that need an image…") : t("The AI is writing the questions…")}>
          <p className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            {job === "soal" && progress ? t("{0} of {1} rows have a question.", progress.filled, progress.total) : t("This can take a few minutes. You can leave this page and come back.")}
          </p>
        </Alert>
      )}
      {drawing && (
        <Alert kind="info" title={t("Drawing notation images…")}>
          <p className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" /> {t("{0} of {1}. Keep this page open until it finishes.", drawing.done, drawing.total)}
          </p>
        </Alert>
      )}
      {!job && exam.jobError && (
        <Alert kind="warning" title={t("The AI did not finish everything")}>
          <p>{t(exam.jobError)}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => start(async () => void (await dismissExamError(exam.id), router.refresh()))}>
            <X /> {t("Dismiss")}
          </Button>
        </Alert>
      )}

      {/* Tabs */}
      <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold whitespace-nowrap", tab === x.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {x.label}
            {x.badge && <Badge tone={tab === x.id ? "primary" : "neutral"}>{x.badge}</Badge>}
          </button>
        ))}
      </div>

      {(tab === "kisi" || tab === "soal") && (
        <div className="grid gap-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="size-5 text-primary" />
            <p className="font-bold">{tab === "kisi" ? t("Make the blueprint with AI") : t("Write the questions with AI")}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {tab === "kisi"
              ? t("The AI spreads {0} questions over the {1} chosen TP, with material, indicator and cognitive level for each. It replaces the current blueprint rows (their questions stay in the question bank).", totalCount(comp), exam.tps.length)
              : t("The AI writes one question for each row that has no question yet ({0} rows), following its indicator and level. The questions are saved in the question bank.", items.length - filled)}
          </p>
          <ProviderSelect options={providers} value={pick} onChange={setPick} disabled={Boolean(job)} />
          <Field label={t("Notes for the AI (optional)")} htmlFor="ex-catatan">
            <Textarea id="ex-catatan" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={1500} placeholder={t("Example: use stories about school music activities; avoid questions about note values.")} />
          </Field>
          {tab === "soal" && (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
              <span>
                <b>{t("Add images where they fit")}</b>
                <span className="block text-xs text-muted-foreground">{t("Staff or numbered notation for questions about reading music, drawn by the app. Pictures the app cannot draw (e.g. instrument photos) are marked for you to upload.")}</span>
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(tab === "kisi" ? "kisi" : "soal")} disabled={busy || Boolean(job) || noProvider || (tab === "kisi" ? exam.tps.length === 0 : items.length === filled || items.length === 0)}>
              {busy || job ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {tab === "kisi" ? (items.length ? t("Make the blueprint again") : t("Make the blueprint")) : t("Write questions ({0})", items.length - filled)}
            </Button>
            {tab === "soal" && filled > 0 && (
              <Button variant="secondary" onClick={() => run("gambar")} disabled={busy || Boolean(job) || noProvider}>
                <ImageIcon /> {t("Add images to suitable questions")}
              </Button>
            )}
            {tab === "kisi" && exam.tps.length === 0 && <p className="self-center text-sm text-warning">{t("Choose the TP in the exam settings first.")}</p>}
          </div>
        </div>
      )}

      {tab === "kisi" && <KisiTab examId={exam.id} groups={bySection} tps={exam.tps} comp={comp} locked={Boolean(job)} />}
      {tab === "soal" && <SoalTab examId={exam.id} groups={bySection} bank={bank} quizzes={quizzes} locked={Boolean(job)} imageAi={imageAi} />}
      {tab === "publish" && <PublishTab exam={exam} items={items} groups={bySection} classrooms={classrooms} linked={linked} locked={Boolean(job)} />}
    </div>
  );
}

type Group = { section: ExamSection; items: (WorkspaceItem & { no: number })[] };

const range = (g: Group) => (g.items.length ? (g.items.length === 1 ? `${g.items[0].no}` : `${g.items[0].no}–${g.items[g.items.length - 1].no}`) : "");

/* ------------------------------------------------------------------ kisi-kisi */

function KisiTab({ examId, groups, tps, comp, locked }: { examId: string; groups: Group[]; tps: string[]; comp: ExamComposition; locked: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const shown = groups.filter((g) => g.items.length > 0 || comp[g.section].count > 0);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/exams/${examId}/kisi`}>
            <Download /> {t("Download blueprint (.docx)")}
          </a>
        </Button>
      </div>
      {shown.map((g, gi) => (
        <section key={g.section} className="grid gap-2">
          <h3 className="font-bold">
            {letter(gi)}. {t(SECTION_META[g.section].label)} {g.items.length > 0 && <span className="text-muted-foreground">({range(g)})</span>}
          </h3>
          {g.items.length === 0 && <p className="text-sm text-muted-foreground">{t("No rows yet.")}</p>}
          <div className={cn("hidden grid-cols-[3rem_1.3fr_1fr_1.6fr_5.5rem_2.5rem] gap-2 px-2 text-xs font-bold text-muted-foreground", g.items.length > 0 && "lg:grid")}>
            <span>{t("No")}</span>
            <span>{t("Learning objective")}</span>
            <span>{t("Material")}</span>
            <span>{t("Question indicator")}</span>
            <span>{t("Cognitive level")}</span>
            <span />
          </div>
          {g.items.map((it) => (
            <KisiRow key={it.id} item={it} tps={tps} locked={locked} />
          ))}
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || locked}
              onClick={() =>
                start(async () => {
                  const r = await addExamItem(examId, g.section);
                  if (!r.ok) toast.error(r.error);
                  router.refresh();
                })
              }
            >
              <Plus /> {t("Add row")}
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}

function KisiRow({ item, tps, locked }: { item: WorkspaceItem & { no: number }; tps: string[]; locked: boolean }) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState({ tp: item.tp, materi: item.materi, indikator: item.indikator, level: item.level });
  const [saved, setSaved] = useState(v);
  const [, start] = useTransition();
  useEffect(() => {
    const fresh = { tp: item.tp, materi: item.materi, indikator: item.indikator, level: item.level };
    setV(fresh);
    setSaved(fresh);
  }, [item.tp, item.materi, item.indikator, item.level]);

  function save(next = v) {
    if (JSON.stringify(next) === JSON.stringify(saved)) return;
    start(async () => {
      const r = await saveExamItem(item.id, next);
      if (!r.ok) return void toast.error(r.error ?? t("Could not save."));
      setSaved(next);
    });
  }
  const tpOptions = v.tp && !tps.includes(v.tp) ? [v.tp, ...tps] : tps;

  return (
    <div className="grid gap-2 rounded-xl border bg-card p-2 lg:grid-cols-[3rem_1.3fr_1fr_1.6fr_5.5rem_2.5rem] lg:items-start">
      <div className="flex items-center justify-between lg:block">
        <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{item.no}</span>
        {item.question ? <CircleCheck className="size-4 text-success lg:mt-2 lg:ml-2" aria-label={t("Has a question")} /> : null}
      </div>
      {/* The full TP wraps (a native select would cut it off); the transparent select on top still opens the picker. */}
      <div className="relative rounded-lg border bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
        <span className={cn("block pr-5 break-words", !v.tp && "text-muted-foreground")}>{v.tp || t("Choose TP…")}</span>
        <ChevronDown className="pointer-events-none absolute top-2.5 right-2 size-4 text-muted-foreground" />
        <select
          value={v.tp}
          disabled={locked}
          onChange={(e) => {
            const next = { ...v, tp: e.target.value };
            setV(next);
            save(next);
          }}
          aria-label={t("Learning objective")}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        >
          <option value="">{t("Choose TP…")}</option>
          {tpOptions.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <Textarea rows={2} value={v.materi} disabled={locked} onChange={(e) => setV({ ...v, materi: e.target.value })} onBlur={() => save()} aria-label={t("Material")} placeholder={t("Material")} className="min-h-10 text-sm" maxLength={300} />
      <Textarea rows={2} value={v.indikator} disabled={locked} onChange={(e) => setV({ ...v, indikator: e.target.value })} onBlur={() => save()} aria-label={t("Question indicator")} placeholder={t("Question indicator")} className="min-h-10 text-sm" maxLength={600} />
      <Select
        value={v.level}
        disabled={locked}
        onChange={(e) => {
          const next = { ...v, level: e.target.value };
          setV(next);
          save(next);
        }}
        aria-label={t("Cognitive level")}
        className="text-sm"
      >
        <option value="">-</option>
        {COGNITIVE_LEVELS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="size-9 justify-self-end text-danger"
        disabled={locked}
        aria-label={t("Delete row")}
        onClick={() =>
          start(async () => {
            const r = await deleteExamItem(item.id);
            if (!r.ok) toast.error(r.error);
            else toast.success(r.message);
            router.refresh();
          })
        }
      >
        <Trash />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ questions */

function SoalTab({
  examId,
  groups,
  bank,
  quizzes,
  locked,
  imageAi,
}: {
  examId: string;
  groups: Group[];
  bank: BankQuestion[];
  quizzes: { id: string; title: string; classroomName: string; n: number }[];
  locked: boolean;
  imageAi: ImageReady;
}) {
  const t = useT();
  const router = useRouter();
  const [quizId, setQuizId] = useState("");
  const [busy, start] = useTransition();
  const used = new Set(groups.flatMap((g) => g.items.map((i) => i.question?.id).filter(Boolean)));

  function fromQuiz() {
    start(async () => {
      const r = await fillExamFromQuiz(examId, quizId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 font-bold">
          <Library className="size-5 text-primary" /> {t("Take questions from a quiz")}
        </p>
        <p className="text-sm text-muted-foreground">{t("Each question goes to the first empty row of its form; when a form is full, a new row is added. Audio, video, MIDI and true/false questions are skipped.")}</p>
        <div className="flex flex-wrap gap-2">
          <Select value={quizId} onChange={(e) => setQuizId(e.target.value)} className="sm:w-96" aria-label={t("Quiz")}>
            <option value="">{t("Choose a quiz…")}</option>
            {quizzes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title} · {q.classroomName} · {t("{0} questions", q.n)}
              </option>
            ))}
          </Select>
          <Button variant="secondary" disabled={!quizId || busy || locked} onClick={fromQuiz}>
            <ListPlus /> {t("Take questions")}
          </Button>
        </div>
      </div>

      {groups
        .filter((g) => g.items.length > 0)
        .map((g, gi) => (
          <section key={g.section} className="grid gap-3">
            <h3 className="font-bold">
              {letter(gi)}. {t(SECTION_META[g.section].label)} <span className="text-muted-foreground">({range(g)})</span>
            </h3>
            {g.items.map((it) => (
              <SoalCard key={it.id} examId={examId} item={it} bank={bank.filter((b) => b.type === SECTION_META[g.section].type && !used.has(b.id))} locked={locked} imageAi={imageAi} />
            ))}
          </section>
        ))}
      {groups.every((g) => g.items.length === 0) && <Alert kind="info">{t("Make the blueprint first, or take questions from a quiz.")}</Alert>}
    </div>
  );
}

function SoalCard({ examId, item, bank, locked, imageAi }: { examId: string; item: WorkspaceItem & { no: number }; bank: BankQuestion[]; locked: boolean; imageAi: ImageReady }) {
  const t = useT();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Open AI picture panel: "q" = the question, "o<i>" = choice i; null = closed. */
  const [aiTarget, setAiTarget] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const q = item.question;
  const choiceImages = q && (q.type === "multiple_choice" || q.type === "multiple_select");
  const targets: ImageTarget[] = q
    ? [
        { id: "q", label: t("Question"), shape: "question", prefill: q.imageHint ?? "" },
        ...(choiceImages ? (q.options ?? []).map((o, i): ImageTarget => ({ id: `o${i}`, label: t("Choice {0}", letter(i)), shape: "option", prefill: o })) : []),
      ]
    : [];

  /** Put a new picture (AI or uploaded) on the question or one choice. */
  async function applyImage(target: string, key: string): Promise<boolean> {
    if (!q) return false;
    const r = target === "q" ? await setQuestionImage(q.id, key, false) : await setOptionImage(q.id, Number(target.slice(1)), key);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    router.refresh();
    return true;
  }

  function removeOptionImage(i: number) {
    if (!q) return;
    start(async () => {
      const r = await setOptionImage(q.id, i, null);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  }

  function image(key: string | null) {
    if (!q) return;
    start(async () => {
      const r = await setQuestionImage(q.id, key);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setUploading(false);
      router.refresh();
    });
  }

  function link(questionId: string | null) {
    start(async () => {
      const r = await linkExamQuestion(item.id, questionId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setPicking(false);
      router.refresh();
    });
  }

  return (
    <div className={cn("rounded-xl border bg-card p-4", !q && "border-dashed")}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{item.no}</span>
        {item.level && <Badge tone="primary">{item.level}</Badge>}
        <span className="min-w-0 flex-1 text-xs text-muted-foreground break-words">
          {[item.materi, item.indikator].filter(Boolean).join(" — ") || item.tp}
        </span>
      </div>

      {q ? (
        <QuestionView
          q={q}
          onOptionImage={choiceImages && !locked ? (i) => setAiTarget(`o${i}`) : undefined}
          onRemoveOptionImage={choiceImages && !locked && !busy ? removeOptionImage : undefined}
        />
      ) : (
        <p className="text-sm font-semibold text-muted-foreground">{t("No question yet.")}</p>
      )}

      {q?.imageHint && !q.mediaKey && (
        <Alert kind="warning" className="mt-3" title={t("This question needs a picture")}>
          <p>{q.imageHint}</p>
          <p className="mt-1 text-xs">{t("The app cannot draw this picture. Upload it, or remove the note if the question works without it.")}</p>
        </Alert>
      )}
      {q && (uploading || (q.imageHint && !q.mediaKey)) && (
        <div className="mt-2 max-w-md">
          <MediaUploader name={`img-${q.id}`} kind="image" allowLink={false} onChange={(key) => key && image(key)} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || locked} onClick={() => setPicking((x) => !x)}>
          <Search /> {q ? t("Replace from bank") : t("Choose from bank")}
        </Button>
        {q && (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/question-bank/${q.id}?back=${encodeURIComponent(`/teacher/exams/${examId}`)}`}>
                <Pencil /> {t("Edit question")}
              </Link>
            </Button>
            {q.mediaKey || q.notation || q.imageHint ? (
              <Button variant="ghost" size="sm" disabled={busy || locked} onClick={() => image(null)}>
                <ImageOff /> {t("Remove image")}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" disabled={busy || locked} onClick={() => setUploading((x) => !x)}>
                <ImageIcon /> {t("Add own image")}
              </Button>
            )}
            <Button variant={aiTarget ? "secondary" : "ghost"} size="sm" disabled={locked} onClick={() => setAiTarget((x) => (x ? null : "q"))}>
              <Sparkles /> {t("AI picture")}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy || locked} onClick={() => link(null)}>
              <Unlink /> {t("Remove")}
            </Button>
          </>
        )}
      </div>
      {q && aiTarget && !locked && <AiImagePanel key={q.id + aiTarget} targets={targets} initial={aiTarget} ready={imageAi} disabled={busy} onApply={applyImage} onClose={() => setAiTarget(null)} />}
      {picking && <BankPicker bank={bank} tp={item.tp} onPick={link} onClose={() => setPicking(false)} busy={busy} />}
    </div>
  );
}

/** The question as the student will see it, with the key marked. */
function QuestionView({ q, onOptionImage, onRemoveOptionImage }: { q: WorkspaceQuestion; onOptionImage?: (i: number) => void; onRemoveOptionImage?: (i: number) => void }) {
  const t = useT();
  const key = q.answerKey;
  const image = (i: number) => q.optionImages?.[i] ?? null;
  return (
    <div className="grid gap-2 text-sm">
      <p className="font-semibold break-words whitespace-pre-line">{q.prompt}</p>
      {q.mediaKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(q.mediaKey)!} alt={t("Question image")} className="max-h-56 w-auto max-w-full justify-self-start rounded-lg border bg-white object-contain" />
      ) : q.notation ? (
        <NotationPreview notation={q.notation} />
      ) : null}
      {(q.type === "multiple_choice" || q.type === "multiple_select") && (
        <ol className="grid gap-1">
          {(q.options ?? []).map((o, i) => {
            const right = (key?.kind === "multiple_choice" && key.correct === i) || (key?.kind === "multiple_select" && key.correct.includes(i));
            return (
              <li key={i} className={cn("group flex gap-2 rounded-lg px-2 py-1", right && "bg-success-soft font-semibold")}>
                <span className="font-bold">{letter(i)}.</span>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="break-words">{o}</span>
                  {image(i) && (
                    <span className="relative inline-block justify-self-start">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(image(i))!} alt={t("Image for choice {0}", letter(i))} className="max-h-28 w-auto max-w-full rounded-md border bg-white object-contain" />
                      {onRemoveOptionImage && (
                        <button
                          type="button"
                          onClick={() => onRemoveOptionImage(i)}
                          className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-danger"
                          aria-label={t("Remove the image of choice {0}", letter(i))}
                          title={t("Remove image")}
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </span>
                  )}
                </span>
                {onOptionImage && (
                  <button
                    type="button"
                    onClick={() => onOptionImage(i)}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary"
                    aria-label={t("Picture for choice {0}", letter(i))}
                    title={t("Picture for choice {0}", letter(i))}
                  >
                    <ImagePlus className="size-4" />
                  </button>
                )}
                {right && <CircleCheck className="size-4 shrink-0 text-success" />}
              </li>
            );
          })}
        </ol>
      )}
      {q.type === "matching" && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="border-b p-1.5">{t("Statement")}</th>
                <th className="border-b p-1.5">{t("Answer")}</th>
              </tr>
            </thead>
            <tbody>
              {(q.matchRows ?? []).map((r, i) => {
                const col = key?.kind === "matching" ? key.pairs[i] : -1;
                return (
                  <tr key={i}>
                    <td className="border-b p-1.5 break-words">
                      {i + 1}. {r}
                    </td>
                    <td className="border-b p-1.5 font-semibold text-success">{col !== undefined && col >= 0 ? `${letter(col)}. ${q.options?.[col] ?? ""}` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {q.type === "fill_in" && key?.kind === "fill_in" && (
        <p className="rounded-lg bg-success-soft px-2 py-1">
          {t("Answer key")}: <b>{key.answer.join(" / ") || "-"}</b>
        </p>
      )}
      {q.type === "essay" && key?.kind === "essay" && key.answer && (
        <p className="rounded-lg bg-success-soft px-2 py-1 whitespace-pre-line">
          {t("Model answer")}: {key.answer}
        </p>
      )}
      {q.explanation && <p className="text-xs text-muted-foreground">💡 {q.explanation}</p>}
    </div>
  );
}

function BankPicker({ bank, tp, onPick, onClose, busy }: { bank: BankQuestion[]; tp: string; onPick: (id: string) => void; onClose: () => void; busy: boolean }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const s = search.trim().toLowerCase();
  const list = bank
    .filter((b) => !s || b.prompt.toLowerCase().includes(s) || (b.topic ?? "").toLowerCase().includes(s))
    // Questions on the row's TP first.
    .sort((a, b) => Number(b.topic === tp) - Number(a.topic === tp))
    .slice(0, 40);
  return (
    <div className="mt-3 grid gap-2 rounded-xl border bg-muted/40 p-3">
      <div className="flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search question or TP…")} aria-label={t("Search question or TP…")} autoFocus />
        <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label={t("Close")} onClick={onClose}>
          <X />
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">{t("No unused questions of this form in your question bank.")}</p>
      ) : (
        <ul className="grid max-h-80 gap-1.5 overflow-y-auto">
          {list.map((b) => (
            <li key={b.id} className="flex items-start gap-2 rounded-lg border bg-card p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 break-words">{b.prompt}</p>
                <p className="mt-0.5 text-xs text-muted-foreground break-words">{[b.topic, b.kelas && t("Class {0}", b.kelas), b.level].filter(Boolean).join(" · ")}</p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => onPick(b.id)}>
                {t("Use")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ download & publish */

function PublishTab({
  exam,
  items,
  groups,
  classrooms,
  linked,
  locked,
}: {
  exam: ExamView;
  items: WorkspaceItem[];
  groups: Group[];
  classrooms: { id: string; name: string }[];
  linked: { id: string; title: string; published: boolean; classroomName: string; attempts: number }[];
  locked: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState(exam.title);
  const [targets, setTargets] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [duration, setDuration] = useState("90");
  const [busy, start] = useTransition();

  const comp = exam.composition;
  const counts = Object.fromEntries(EXAM_SECTIONS.map((s) => [s, groups.find((g) => g.section === s)!.items.length])) as Record<ExamSection, number>;
  const points = pointsPerQuestion(comp, counts);
  const weight = EXAM_SECTIONS.reduce((n, s) => n + (counts[s] > 0 ? comp[s].weight : 0), 0);
  const missing = items.filter((i) => !i.question).length;
  const needImage = items.filter((i) => i.question && !i.question.mediaKey && (i.question.imageHint || i.question.notation)).length;
  const problems = [
    needImage > 0 && t("{0} questions still need their image.", needImage),
    items.length === 0 && t("The exam has no rows yet."),
    missing > 0 && t("{0} rows have no question yet.", missing),
    Math.abs(weight - 100) > 0.01 && t("The weights of the sections that have questions add up to {0}%, not 100%.", Math.round(weight * 100) / 100),
  ].filter((x): x is string => Boolean(x));

  function publish(published: boolean) {
    start(async () => {
      const r = await publishExam(exam.id, { classroomIds: targets, title, startsAt: startsAt || null, endsAt: endsAt || null, durationMinutes: duration ? Number(duration) : null, published });
      if (!r.ok) return void toast.error(r.error ?? t("Could not save."));
      toast.success(r.message);
      setTargets([]);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 font-bold">
          <FileSpreadsheet className="size-5 text-primary" /> {t("Download")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/exams/${exam.id}/kisi`}>
              <Download /> {t("Blueprint (kisi-kisi) .docx")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/exams/${exam.id}/cbt`}>
              <Download /> {t("Questions in CBT upload format .docx")}
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("The CBT file follows the school's upload template (JENIS 1-5 tables, the key marked with v), so it can be uploaded to the CBT application as is.")}</p>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4">
        <p className="flex items-center gap-2 font-bold">
          <Send className="size-5 text-primary" /> {t("Run the exam online in this app")}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-1.5">{t("Form")}</th>
                <th className="p-1.5">{t("Questions")}</th>
                <th className="p-1.5">{t("Weight")}</th>
                <th className="p-1.5">{t("Points per question")}</th>
              </tr>
            </thead>
            <tbody>
              {EXAM_SECTIONS.filter((s) => counts[s] > 0 || comp[s].weight > 0).map((s) => (
                <tr key={s} className="border-t">
                  <td className="p-1.5 font-semibold">{t(SECTION_META[s].label)}</td>
                  <td className="p-1.5">{counts[s]}</td>
                  <td className="p-1.5">{comp[s].weight}%</td>
                  <td className="p-1.5">{counts[s] ? Math.round(points[s] * 100) / 100 : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{t("The grade (0-100) follows these weights. Complex multiple choice and matching give partial points; essays are graded by you.")}</p>

        {problems.length > 0 ? (
          <Alert kind="warning" title={t("Not ready to publish")}>
            <ul className="list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <div className="grid gap-4">
            <Field label={t("Title for students")} htmlFor="pub-title">
              <Input id="pub-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">{t("Classes")}</legend>
              {classrooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("You have no classes yet.")}</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {classrooms.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm hover:bg-muted">
                      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={targets.includes(c.id)} onChange={() => setTargets((a) => (a.includes(c.id) ? a.filter((x) => x !== c.id) : [...a, c.id]))} />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("Opens (WIB)")} htmlFor="pub-start">
                <Input id="pub-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </Field>
              <Field label={t("Closes (WIB)")} htmlFor="pub-end">
                <Input id="pub-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
              <Field label={t("Duration (minutes)")} htmlFor="pub-dur" hint={t("Empty = no time limit")}>
                <Input id="pub-dur" type="number" min={1} max={300} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{t("Each class gets its own quiz: one attempt, answers and grades shown after submitting. You can change the schedule later in Quizzes.")}</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || locked || targets.length === 0} onClick={() => publish(true)}>
                <Send /> {t("Publish to {0} classes", targets.length)}
              </Button>
              <Button variant="outline" disabled={busy || locked || targets.length === 0} onClick={() => publish(false)}>
                {t("Save as draft")}
              </Button>
            </div>
          </div>
        )}

        {linked.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-bold">{t("Already sent to")}</p>
            {linked.map((q) => (
              <Link key={q.id} href={`/teacher/quizzes/${q.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm hover:border-primary">
                <span className="font-semibold">{q.classroomName}</span>
                <span className="text-muted-foreground">{q.title}</span>
                <Badge tone={q.published ? "success" : "warning"}>{q.published ? t("Published") : t("Draft")}</Badge>
                <Badge>{t("{0} attempts", q.attempts)}</Badge>
              </Link>
            ))}
            <p className="text-xs text-muted-foreground">{t("Changing a question in the bank also changes it in these quizzes. Adding or removing rows here does not; publish again for that.")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
