"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck2, ImageIcon, LoaderCircle, Pencil, RefreshCw, ScanSearch, Sparkles, TriangleAlert, X } from "lucide-react";
import { dismissPracticeError, keepPracticeQuestion, practiceJobStatus, replacePracticeQuestion, rewritePracticeQuestion, startPracticeJob } from "@/app/actions/exam";
import { SoalCard, useNotationDrawing, type BankQuestion, type WorkspaceItem } from "@/components/exam-workspace";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Alert, PageHeader } from "@/components/ui/misc";
import type { ImageReady } from "@/lib/ai";
import { SECTION_META, letter, type ExamSection } from "@/lib/exam";
import { useT } from "@/i18n/client";

export type PracticeGroup = { section: ExamSection; items: (WorkspaceItem & { no: number })[] };

const POLL_MS = 4000;
type Kind = "periksa" | "gambar" | "ulang";

/** The questions of a practice quiz (Latihan Ujian), each with the exam's question tools, plus AI jobs over the whole practice. */
export function PracticeEditor({
  quiz,
  exam,
  classes,
  groups,
  other,
  bank,
  providers,
  imageAi,
}: {
  quiz: { id: string; title: string };
  /** The exam, with the AI job running on it (practice jobs use the exam's job slot). */
  exam: { id: string; title: string; job: string | null; jobError: string | null };
  /** Classes that got this practice (they share its questions). */
  classes: string[];
  groups: PracticeGroup[];
  /** Questions of a form an exam does not use (audio, MIDI…): edited from the quiz itself. */
  other: number;
  bank: BankQuestion[];
  providers: ProviderOption[];
  imageAi: ImageReady;
}) {
  const t = useT();
  const router = useRouter();
  const [pick, setPick] = useProviderPick();
  const [job, setJob] = useState<string | null>(exam.job);
  const [catatan, setCatatan] = useState("");
  const [withImages, setWithImages] = useState(true);
  const [busy, start] = useTransition();
  const items = groups.flatMap((g) => g.items);
  const drawing = useNotationDrawing(
    items.map((i) => i.question),
    Boolean(job),
  );
  const back = `/teacher/quizzes/${quiz.id}/soal`;
  const filled = groups.filter((g) => g.items.length > 0);
  const marked = items.filter((i) => i.kisiChanged).length;
  const linked = items.some((i) => i.materi || i.indikator);
  const noProvider = !providerReady(providers, pick);
  const locked = Boolean(job);

  // Follow the server's job state after a refresh.
  useEffect(() => setJob(exam.job), [exam.job]);

  // Poll while the AI works; refresh the page when it is done.
  useEffect(() => {
    if (!job) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const r = await practiceJobStatus(quiz.id).catch(() => null);
      if (stopped) return;
      if (r?.ok && r.data && !r.data.job) {
        setJob(null);
        const nos = (list: number[]) => list.join(", ");
        const lines =
          job === "latihan-periksa"
            ? r.data.markedNos.length
              ? [t("Questions no. {0}", nos(r.data.markedNos))]
              : []
            : job === "latihan-gambar"
              ? [
                  ...(r.data.drawnNos.length ? [t("Notation image: questions no. {0}", nos(r.data.drawnNos))] : []),
                  ...(r.data.uploadNos.length ? [t("Picture to upload yourself: questions no. {0}", nos(r.data.uploadNos))] : []),
                ]
              : [];
        const detail = lines.length ? { description: lines.map((l) => <span key={l} className="block">{l}</span>), duration: 15000, closeButton: true } : undefined;
        if (r.data.jobError) toast.warning(t(r.data.jobError), detail);
        else
          toast.success(
            job === "latihan-periksa"
              ? r.data.marked
                ? t("Check done: {0} questions are marked “Does not fit”.", r.data.marked)
                : t("Check done: every question fits its blueprint row.")
              : job === "latihan-gambar"
                ? t("The AI chose the questions that get an image.")
                : job === "latihan-ulang"
                  ? t("The marked questions were rewritten. Check them.")
                  : t("The AI finished. Check the questions."),
            detail,
          );
        router.refresh();
        return;
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
  }, [job, quiz.id]);

  function run(kind: Kind) {
    start(async () => {
      const r = await startPracticeJob(quiz.id, kind, { provider: pick, catatan, gambar: withImages });
      if (!r.ok) return void toast.error(r.error ?? t("Could not start the generation."));
      setJob(`latihan-${kind}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t("Manage practice questions")}
        description={t("{0} — practice of the exam “{1}”. The exam's own questions never change here.", quiz.title, exam.title)}
        action={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/exams/${exam.id}`}>
                <FileCheck2 /> {t("Open exam")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/quizzes/${quiz.id}/edit`}>
                <Pencil /> {t("Quiz settings")}
              </Link>
            </Button>
          </>
        }
      />
      {classes.length > 1 && (
        <Alert kind="info" title={t("Shared by {0} classes", classes.length)}>
          {t("This practice was sent to {0}. Its questions are shared, so every change here applies to all of them.", classes.join(", "))}
        </Alert>
      )}

      {/* Job state */}
      {job && (
        <Alert
          kind="info"
          title={
            job === "latihan-periksa"
              ? t("The AI is checking whether the questions fit the blueprint…")
              : job === "latihan-gambar"
                ? t("The AI is choosing questions that need an image…")
                : job === "latihan-ulang"
                  ? t("The AI is rewriting the marked questions…")
                  : t("The AI is still working on this exam. Wait until it finishes.")
          }
        >
          <p className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" /> {t("This can take a few minutes. You can leave this page and come back.")}
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
          <Button variant="outline" size="sm" className="mt-2" onClick={() => start(async () => void (await dismissPracticeError(quiz.id), router.refresh()))}>
            <X /> {t("Dismiss")}
          </Button>
        </Alert>
      )}

      {/* AI over the whole practice */}
      {items.length > 0 && (
        <div className="grid gap-3 rounded-xl border bg-card p-4">
          <p className="flex items-center gap-2 font-bold">
            <Sparkles className="size-5 text-primary" /> {t("Work on the practice questions with AI")}
          </p>
          <p className="text-sm text-muted-foreground">{t("“Rewrite with AI” writes a new practice question for the same TP, material, indicator and level, different from this one and from the exam question.")}</p>
          {marked > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{t("{0} questions are marked “Does not fit” their blueprint row. Rewrite them all at once below, one by one with “Rewrite with AI”, or keep a question that still fits.", marked)}</span>
            </p>
          )}
          <ProviderSelect options={providers} value={pick} onChange={setPick} disabled={locked} />
          <Field label={t("Notes for the AI (optional)")} htmlFor="lp-catatan">
            <Textarea id="lp-catatan" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={1500} placeholder={t("Example: make the practice a little easier than the exam.")} />
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
            <span>
              <b>{t("Add images where they fit")}</b>
              <span className="block text-xs text-muted-foreground">{t("Staff or numbered notation for questions about reading music, drawn by the app. Pictures the app cannot draw (e.g. instrument photos) are marked for you to upload.")}</span>
            </span>
          </label>
          {noProvider && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run("ulang")} disabled={busy || locked || noProvider || marked === 0} title={t("The notes and the image option above apply to this.")}>
              {busy || job ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} {t("Rewrite marked questions ({0})", marked)}
            </Button>
            {linked && items.length > marked && (
              <Button
                variant="secondary"
                onClick={() => run("periksa")}
                disabled={busy || locked || noProvider}
                title={t("The AI compares each question with its TP, indicator and level and marks the ones that do not fit. Uses 1 AI allowance.")}
              >
                <ScanSearch /> {t("Check questions against the blueprint")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => run("gambar")} disabled={busy || locked || noProvider}>
              <ImageIcon /> {t("Add images to suitable questions")}
            </Button>
          </div>
        </div>
      )}

      {filled.map((g, gi) => (
        <section key={g.section} className="grid gap-3">
          <h3 className="font-bold">
            {letter(gi)}. {t(SECTION_META[g.section].label)}
          </h3>
          {g.items.map((it) => (
            <SoalCard
              key={it.id}
              actions={{
                rewrite: (d) => rewritePracticeQuestion(quiz.id, it.question!.id, d),
                link: (id) => replacePracticeQuestion(quiz.id, it.question!.id, id),
                keep: () => keepPracticeQuestion(quiz.id, it.question!.id),
                mark: { label: t("Does not fit"), title: t("The AI check found that this question does not fit its blueprint row") },
                back,
              }}
              item={it}
              bank={bank.filter((b) => b.type === SECTION_META[g.section].type)}
              locked={locked}
              imageAi={imageAi}
              provider={pick}
            />
          ))}
        </section>
      ))}
      {filled.length === 0 && <Alert kind="info">{t("This practice has no exam-form questions. Add questions with Quiz settings.")}</Alert>}
      {other > 0 && <p className="text-sm text-muted-foreground">{t("{0} other questions (audio, MIDI…) are edited from the quiz preview.", other)}</p>}
    </div>
  );
}
