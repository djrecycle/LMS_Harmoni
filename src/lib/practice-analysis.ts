import type { Translate } from "@/i18n";
import { PRACTICE_KIND_LABEL, type MelodyDetail, type PracticeKind, type RhythmDetail, type SolfegeDetail, type SongDetail, type TempoDetail } from "@/lib/practice";

/** One saved practice attempt, oldest first. */
export type PracticeAttempt = { kind: PracticeKind; score: number; detail: Record<string, unknown> | null; createdAt: Date; inLesson: boolean };

export type KindSummary = { kind: PracticeKind; attempts: number; first: number; last: number; best: number; average: number; notes: string[] };

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

/** What the attempts of one practice kind say about the student: numbers plus short observations (translated). */
function summarizeKind(t: Translate, kind: PracticeKind, list: PracticeAttempt[]): KindSummary {
  const scores = list.map((a) => a.score);
  const last = list[list.length - 1];
  const notes: string[] = [];

  if (kind === "rhythm" || kind === "tempo") {
    const details = list.map((a) => (a.detail ?? {}) as RhythmDetail);
    const diffs = details.flatMap((d) => d.diffs ?? []);
    const hit = diffs.filter((d): d is number => typeof d === "number");
    if (hit.length >= 3) {
      const m = Math.round(mean(hit));
      if (m >= 60) notes.push(t("tends to tap late (about {0} ms behind the beat)", m));
      else if (m <= -60) notes.push(t("tends to tap early (about {0} ms ahead of the beat)", -m));
      else notes.push(t("taps mostly on the beat"));
    }
    // In tempo practice a drifting beat already shows up as speeding up / slowing down, not as missed or extra taps.
    if (kind === "rhythm" && diffs.length) {
      const missed = Math.round(((diffs.length - hit.length) / diffs.length) * 100);
      if (missed >= 20) notes.push(t("misses many beats ({0}% missed)", missed));
    }
    const extra = mean(details.map((d) => d.extra ?? 0));
    if (kind === "rhythm" && extra >= 1) notes.push(t("adds extra taps"));
  }

  if (kind === "tempo" && last.detail) {
    const d = last.detail as TempoDetail;
    if (d.actualBpm != null) {
      if (d.actualBpm > d.bpm * 1.05) notes.push(t("speeds up once the metronome stops ({0} vs {1} BPM)", d.actualBpm, d.bpm));
      else if (d.actualBpm < d.bpm * 0.95) notes.push(t("slows down once the metronome stops ({0} vs {1} BPM)", d.actualBpm, d.bpm));
      else notes.push(t("holds the tempo on their own ({0} BPM)", d.actualBpm));
    }
    if (d.cv != null) notes.push(d.cv <= 0.06 ? t("the beat is very steady") : d.cv <= 0.12 ? t("the beat is fairly steady") : t("the spacing between beats is still uneven"));
  }

  if (kind === "melody" && last.detail) {
    const d = last.detail as MelodyDetail;
    if (d.correct === d.total && d.extra === 0) notes.push(t("rewrote the melody exactly"));
    else {
      if (d.wrongPitch) notes.push(t("{0} notes at the wrong pitch", d.wrongPitch));
      if (d.wrongRhythm) notes.push(t("{0} notes with the wrong position or length", d.wrongRhythm));
      if (d.missing) notes.push(t("{0} notes missing", d.missing));
      if (d.extra) notes.push(t("{0} extra notes", d.extra));
    }
  }

  if (kind === "solfege") {
    const missed: Record<string, number> = {};
    for (const a of list) for (const [s, n] of Object.entries(((a.detail ?? {}) as SolfegeDetail).missed ?? {})) missed[s] = (missed[s] ?? 0) + n;
    const worst = Object.entries(missed)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([s]) => s);
    if (worst.length) notes.push(t("most often mistakes {0}", worst.join(", ")));
    else notes.push(t("names every note correctly"));
  }

  if (kind === "song" && last.detail) {
    const d = last.detail as SongDetail;
    if (d.wrong === 0) notes.push(t("played the last song without a wrong key"));
    else notes.push(t("pressed {0} wrong keys in the last song", d.wrong));
    if (d.speed < 1) notes.push(t("still practicing at {0}% speed", Math.round(d.speed * 100)));
  }

  return { kind, attempts: list.length, first: scores[0], last: scores[scores.length - 1], best: Math.max(...scores), average: Math.round(mean(scores)), notes };
}

/** Attempts grouped by practice kind, in a fixed order. */
export function summarizeAttempts(t: Translate, attempts: PracticeAttempt[]): KindSummary[] {
  const order = Object.keys(PRACTICE_KIND_LABEL) as PracticeKind[];
  return order.flatMap((kind) => {
    const list = attempts.filter((a) => a.kind === kind);
    return list.length ? [summarizeKind(t, kind, list)] : [];
  });
}

/** Rule-based analysis paragraph for one student's practice in one lesson. */
export function ruleAnalysis(t: Translate, attempts: PracticeAttempt[]): string {
  const kinds = summarizeAttempts(t, attempts);
  if (!kinds.length) return t("Has not done any practice in this lesson yet.");
  const parts = kinds.map((k) => {
    let s = t("{0}: {1} attempts, best score {2}, last {3}", t(PRACTICE_KIND_LABEL[k.kind]), k.attempts, k.best, k.last);
    if (k.attempts >= 2 && k.last - k.first >= 10) s += t(" (improving from {0})", k.first);
    else if (k.attempts >= 2 && k.first - k.last >= 10) s += t(" (dropping from {0})", k.first);
    if (k.notes.length) s += ` — ${k.notes.join("; ")}`;
    return `${s}.`;
  });
  const outside = attempts.filter((a) => !a.inLesson).length;
  if (outside) parts.push(t("{0} of these attempts were done outside the lesson (Practice menu).", outside));
  const overall = mean(kinds.map((k) => k.best));
  parts.push(
    overall >= 85
      ? t("Overall: has mastered this practice.")
      : overall >= 70
        ? t("Overall: good, a little more practice will make it solid.")
        : overall >= 50
          ? t("Overall: fair; practise again slowly, focusing on the points above.")
          : t("Overall: needs guidance from the teacher on this practice."),
  );
  return parts.join(" ");
}
