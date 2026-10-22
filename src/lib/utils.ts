import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Language-neutral numeric formats (DD/MM/YYYY, HH:mm) in the WIB zone, so they read the same in English and Indonesian.
const fmtDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jakarta" });
const fmtDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});

export const formatDate = (d: Date | string | null | undefined) => (d ? fmtDate.format(new Date(d)) : "-");
export const formatDateTime = (d: Date | string | null | undefined) => (d ? fmtDateTime.format(new Date(d)) : "-");

/** Today's date (YYYY-MM-DD) in the WIB zone, used for "Today's Lessons". */
export function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/** `tanggal` (YYYY-MM-DD) shifted by `days` calendar days. */
export function addDays(tanggal: string, days: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const round = (n: number, digit = 0) => {
  const f = 10 ** digit;
  return Math.round(n * f) / f;
};

/* Time zone: all schedules are entered and shown in WIB (UTC+7, no DST). */
const WIB_MS = 7 * 60 * 60 * 1000;

/** Date -> value for <input type="datetime-local"> (WIB). */
export function toWibInput(d: Date | null | undefined): string {
  return d ? new Date(d.getTime() + WIB_MS).toISOString().slice(0, 16) : "";
}

/** <input type="datetime-local"> value (assumed WIB) -> Date. */
export function fromWibInput(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s.length === 16 ? s + ":00" : s}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shorten long text for places that cannot wrap, such as native <select> options (which otherwise run off the screen). */
export function shortLabel(text: string, max = 45): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
