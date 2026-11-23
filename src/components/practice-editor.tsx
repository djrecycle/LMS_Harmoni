"use client";

import Link from "next/link";
import { Dumbbell, FileCheck2, LoaderCircle, Pencil } from "lucide-react";
import { replacePracticeQuestion, rewritePracticeQuestion } from "@/app/actions/exam";
import { SoalCard, useNotationDrawing, type BankQuestion, type WorkspaceItem } from "@/components/exam-workspace";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/misc";
import type { ImageReady } from "@/lib/ai";
import { SECTION_META, letter, type ExamSection } from "@/lib/exam";
import { useT } from "@/i18n/client";

export type PracticeGroup = { section: ExamSection; items: (WorkspaceItem & { no: number })[] };

/** The questions of a practice quiz (Latihan Ujian), each with the exam's question tools: replace, rewrite with AI, edit, images, take out. */
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
  exam: { id: string; title: string };
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
  const [pick, setPick] = useProviderPick();
  const drawing = useNotationDrawing(
    groups.flatMap((g) => g.items.map((i) => i.question)),
    false,
  );
  const back = `/teacher/quizzes/${quiz.id}/soal`;
  const filled = groups.filter((g) => g.items.length > 0);

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
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <Dumbbell className="size-5 text-primary" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t("“Rewrite with AI” writes a new practice question for the same TP, material, indicator and level, different from this one and from the exam question.")}</p>
        <ProviderSelect options={providers} value={pick} onChange={setPick} />
      </div>
      {!providerReady(providers, pick) && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}
      {drawing && (
        <Alert kind="info" title={t("Drawing notation images…")}>
          <p className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" /> {t("{0} of {1}. Keep this page open until it finishes.", drawing.done, drawing.total)}
          </p>
        </Alert>
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
                back,
              }}
              item={it}
              bank={bank.filter((b) => b.type === SECTION_META[g.section].type)}
              locked={false}
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
