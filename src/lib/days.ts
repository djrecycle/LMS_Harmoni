/** Client-safe: the day-of-week constants, usable from both server data code and client components. */
export const DAYS = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"] as const;
export type DayOfWeek = (typeof DAYS)[number];

export const DAY_LABEL: Record<DayOfWeek, string> = { senin: "Senin", selasa: "Selasa", rabu: "Rabu", kamis: "Kamis", jumat: "Jumat", sabtu: "Sabtu", minggu: "Minggu" };

/** The Indonesian day name for a "YYYY-MM-DD" date (calendar date, timezone-independent — no DST in WIB). */
export function dayOfWeekFromDate(tanggal: string): DayOfWeek {
  const jsDay = new Date(`${tanggal}T12:00:00+07:00`).getUTCDay(); // 0=Sunday..6=Saturday
  return DAYS[(jsDay + 6) % 7]; // rotate so 0=senin..6=minggu
}

/** Current day name and "HH:mm" in WIB (also used in the browser, so the timetable's Live Class button updates by itself). */
export function nowWib(): { day: DayOfWeek; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const jsDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { day: DAYS[(jsDay + 6) % 7], time: `${hour}:${get("minute")}` };
}

export function isOngoing(row: { hari: DayOfWeek; jamMulai: string; jamSelesai: string }, now = nowWib()) {
  return row.hari === now.day && row.jamMulai <= now.time && now.time < row.jamSelesai;
}
