import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { membersOf } from "@/lib/members";
import { PRACTICE_KIND_LABEL, type PracticeKind } from "@/lib/practice";

const S = schema;

export type KindStat = { attempts: number; best: number; last: number; average: number };
export type SongStat = { key: string; title: string; attempts: number; best: number; last: number; lastAt: string };
export type ClassPracticeRow = {
  studentId: string;
  name: string;
  attempts: number;
  lastAt: string | null;
  kinds: Partial<Record<PracticeKind, KindStat>>;
  songs: SongStat[];
};

export const RECAP_RANGES = { "7": 7, "30": 30, "90": 90, all: null } as const;
export type RecapRange = keyof typeof RECAP_RANGES;

/** "Lagu: Ibu Kita Kartini (100 BPM)" or "Song: …" -> "Ibu Kita Kartini". */
const songName = (title: string) => title.replace(/^[^:]+:\s*/, "").replace(/\s*\(\d+ BPM\)\s*$/, "") || title;

/**
 * Practice recap of one class: every student with their saved practice scores (Practice menu, Piano Virtual songs,
 *  lessons and practice materials alike) grouped by kind, and their songs one by one. The caller checks ownership.
 */
export async function loadClassPracticeRecap(classroomId: string, range: RecapRange): Promise<{ rows: ClassPracticeRow[]; kinds: PracticeKind[] }> {
  const members = await db
    .select({ studentId: S.classroomMembership.studentId, name: S.user.name })
    .from(S.classroomMembership)
    .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
    .where(membersOf([classroomId]));
  const ids = members.map((m) => m.studentId);
  const days = RECAP_RANGES[range];
  const since = days ? new Date(Date.now() - days * 86_400_000) : null;
  const results = ids.length
    ? await db
        .select({ studentId: S.practiceResult.studentId, kind: S.practiceResult.kind, title: S.practiceResult.title, score: S.practiceResult.score, detail: S.practiceResult.detail, createdAt: S.practiceResult.createdAt })
        .from(S.practiceResult)
        .where(and(inArray(S.practiceResult.studentId, ids), since ? gte(S.practiceResult.createdAt, since) : undefined))
        .orderBy(asc(S.practiceResult.createdAt))
    : [];

  const byStudent = new Map<string, typeof results>();
  for (const r of results) {
    const list = byStudent.get(r.studentId) ?? [];
    list.push(r);
    byStudent.set(r.studentId, list);
  }

  const rows = members
    .map(({ studentId, name }): ClassPracticeRow => {
      const list = byStudent.get(studentId) ?? []; // oldest first
      const kinds: ClassPracticeRow["kinds"] = {};
      const sums = new Map<PracticeKind, number>();
      const songs = new Map<string, SongStat>();
      for (const r of list) {
        const k = kinds[r.kind] ?? { attempts: 0, best: 0, last: 0, average: 0 };
        k.attempts++;
        k.best = Math.max(k.best, r.score);
        k.last = r.score;
        kinds[r.kind] = k;
        sums.set(r.kind, (sums.get(r.kind) ?? 0) + r.score);
        if (r.kind === "song") {
          const key = typeof r.detail?.songId === "string" ? r.detail.songId : songName(r.title);
          const s = songs.get(key) ?? { key, title: songName(r.title), attempts: 0, best: 0, last: 0, lastAt: "" };
          s.attempts++;
          s.best = Math.max(s.best, r.score);
          s.last = r.score;
          s.title = songName(r.title);
          s.lastAt = r.createdAt.toISOString();
          songs.set(key, s);
        }
      }
      for (const [kind, sum] of sums) kinds[kind]!.average = Math.round(sum / kinds[kind]!.attempts);
      return {
        studentId,
        name,
        attempts: list.length,
        lastAt: list.length ? list[list.length - 1].createdAt.toISOString() : null,
        kinds,
        songs: [...songs.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const kinds = (Object.keys(PRACTICE_KIND_LABEL) as PracticeKind[]).filter((k) => rows.some((r) => r.kinds[k]));
  return { rows, kinds };
}
