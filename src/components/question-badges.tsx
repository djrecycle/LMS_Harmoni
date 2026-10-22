import { Badge } from "@/components/ui/misc";
import type { Translate } from "@/i18n";
import { QUESTION_TYPE_LABELS, type AnswerType, type QuestionSound, type QuestionType } from "@/lib/questions";

export const TYPE_TONES: Record<QuestionType, "primary" | "success" | "warning" | "neutral"> = {
  multiple_choice: "neutral",
  fill_in: "neutral",
  true_false: "neutral",
  audio: "primary",
  video: "primary",
  midi: "warning",
};

/** A question counts as "new" for this long after it was created. */
export const NEW_FOR_MS = 24 * 60 * 60 * 1000;

export type QuestionBadgeInfo = {
  type: QuestionType;
  answerType: AnswerType;
  mediaKey: string | null;
  sound: QuestionSound | null;
  kelas: string | null;
  semester: number | null;
  points: number;
  createdAt: Date | string;
};

/**
 * The info badges of a question (new, type, answer type, media/sound, class, semester, points, quiz usage).
 *  Shared by the question bank and the quiz question picker so both show the same thing.
 *  `now` is passed in so server and client render the same "new" badge.
 */
export function QuestionBadges({ q, t, now, usedIn = 0 }: { q: QuestionBadgeInfo; t: Translate; now: number; usedIn?: number }) {
  const created = new Date(q.createdAt).getTime();
  return (
    <>
      {now - created < NEW_FOR_MS && <Badge tone="success">{t("New")}</Badge>}
      <Badge tone={TYPE_TONES[q.type]}>{t(QUESTION_TYPE_LABELS[q.type])}</Badge>
      {q.answerType !== q.type && q.type !== "midi" && (
        <Badge>
          {t("answer:")} {t(QUESTION_TYPE_LABELS[q.answerType as QuestionType])}
        </Badge>
      )}
      {q.mediaKey && q.type !== "audio" && q.type !== "video" && <Badge>{t("has media")}</Badge>}
      {q.sound && <Badge tone="primary">{q.sound.kind === "tempo" ? t("app sound: tempo") : q.sound.kind === "rhythm" ? t("app sound: rhythm") : t("app sound: piano")}</Badge>}
      {q.kelas && <Badge tone="primary">{t("Class {0}", q.kelas)}</Badge>}
      {q.semester && <Badge tone="primary">{t("Semester {0}", q.semester)}</Badge>}
      <Badge>
        {q.points} {t("points")}
      </Badge>
      {usedIn > 0 && (
        <Badge tone="success">
          {t("used in")} {usedIn} {t("quizzes")}
        </Badge>
      )}
    </>
  );
}
