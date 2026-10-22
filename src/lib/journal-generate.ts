import { holidayOn, withinSchoolYear, type KaldikData } from "@/lib/calendar-data";
import { dayOfWeekFromDate } from "@/lib/days";
import type { GenerateScheduleRow } from "@/lib/journal-data";

export type GeneratedRowStatus = "new" | "exists" | "holiday" | "outside_term";

export type GeneratedRow = {
  tanggal: string;
  classroomId: string;
  classroomName: string;
  mataPelajaran: string;
  jamMulai: string;
  jamSelesai: string;
  status: GeneratedRowStatus;
  /** Set for "holiday": the calendar's label for that day. */
  note?: string;
};

function nextDate(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Walk each date in [start, end], match it against the weekly schedule, and classify each hit against
 * the academic calendar (holiday / outside any semester) and the sessions that already exist. Pure
 * function — no DB access — so it can be reused for both the preview and the actual write.
 */
export function planJournalGeneration({
  start,
  end,
  schedule,
  calendars,
  existingKeys,
}: {
  start: string;
  end: string;
  schedule: GenerateScheduleRow[];
  calendars: KaldikData[];
  existingKeys: Set<string>;
}): GeneratedRow[] {
  const out: GeneratedRow[] = [];
  for (let tanggal = start; tanggal <= end; tanggal = nextDate(tanggal)) {
    const hari = dayOfWeekFromDate(tanggal);
    const todays = schedule.filter((s) => s.hari === hari);
    if (todays.length === 0) continue;

    // No calendar uploaded at all -> don't restrict by term, only by holidays (there are none to check).
    let holiday: string | null = null;
    let inTerm = calendars.length === 0;
    for (const cal of calendars) {
      holiday ||= holidayOn(cal, tanggal);
      if (withinSchoolYear(cal, tanggal)) inTerm = true;
    }

    // A class can have more than one period the same day (e.g. two back-to-back slots) — a journal entry
    // covers the whole meeting, so merge same-class same-day rows into one instead of one entry per period.
    const byClassroom = new Map<string, GenerateScheduleRow[]>();
    for (const s of todays) {
      const list = byClassroom.get(s.classroomId);
      if (list) list.push(s);
      else byClassroom.set(s.classroomId, [s]);
    }

    for (const [classroomId, rows] of byClassroom) {
      const jamMulai = rows.reduce((min, r) => (r.jamMulai < min ? r.jamMulai : min), rows[0].jamMulai);
      const jamSelesai = rows.reduce((max, r) => (r.jamSelesai > max ? r.jamSelesai : max), rows[0].jamSelesai);
      const mataPelajaran = [...new Set(rows.map((r) => r.mataPelajaran))].join(", ");

      const key = `${classroomId}|${tanggal}`;
      let status: GeneratedRowStatus;
      let note: string | undefined;
      if (existingKeys.has(key)) status = "exists";
      else if (holiday) {
        status = "holiday";
        note = holiday;
      } else if (!inTerm) status = "outside_term";
      else status = "new";
      out.push({ tanggal, classroomId, classroomName: rows[0].classroomName, mataPelajaran, jamMulai, jamSelesai, status, note });
    }
  }
  return out;
}
