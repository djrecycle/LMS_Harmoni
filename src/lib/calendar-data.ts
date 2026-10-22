import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const S = schema;

export type KaldikEventKind = "libur" | "efektif" | "ujian" | "pts" | "pas" | "lainnya";
export type KaldikEvent = { tanggal_mulai: string; tanggal_selesai: string; keterangan: string; jenis: KaldikEventKind };
export type KaldikSemester = { nama: string; mulai: string; selesai: string; minggu_efektif: string; hari_efektif: string; kegiatan: KaldikEvent[] };
export type KaldikData = { tahun_ajaran: string; catatan: string; semester: KaldikSemester[]; libur_nasional: { tanggal: string; keterangan: string }[] };

/** All calendar events flattened, each carrying its own kind and source label (for a month view / table). */
export type FlatEvent = { start: string; end: string; label: string; kind: KaldikEventKind | "nasional"; semester?: string };

export function flattenEvents(data: KaldikData | null | undefined): FlatEvent[] {
  if (!data) return [];
  const out: FlatEvent[] = [];
  for (const s of data.semester ?? []) {
    for (const k of s.kegiatan ?? []) {
      if (!k.tanggal_mulai) continue;
      out.push({ start: k.tanggal_mulai, end: k.tanggal_selesai || k.tanggal_mulai, label: k.keterangan, kind: k.jenis, semester: s.nama });
    }
  }
  for (const l of data.libur_nasional ?? []) {
    if (!l.tanggal) continue;
    out.push({ start: l.tanggal, end: l.tanggal, label: l.keterangan, kind: "nasional" });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** The holiday label covering `tanggal` (a national holiday or a "libur" activity), or null when it's not a holiday per this calendar. */
export function holidayOn(data: KaldikData | null | undefined, tanggal: string): string | null {
  if (!data) return null;
  const nasional = (data.libur_nasional ?? []).find((l) => l.tanggal === tanggal);
  if (nasional) return nasional.keterangan || "Libur nasional";
  for (const s of data.semester ?? []) {
    for (const k of s.kegiatan ?? []) {
      if (k.jenis === "libur" && k.tanggal_mulai && tanggal >= k.tanggal_mulai && tanggal <= (k.tanggal_selesai || k.tanggal_mulai)) {
        return k.keterangan || "Libur";
      }
    }
  }
  return null;
}

/** True when `tanggal` falls inside some semester's date range in this calendar (i.e. inside a school term, not a semester break). */
export function withinSchoolYear(data: KaldikData | null | undefined, tanggal: string): boolean {
  if (!data) return false;
  return (data.semester ?? []).some((s) => s.mulai && s.selesai && tanggal >= s.mulai && tanggal <= s.selesai);
}

export async function listCalendars(teacherId: string) {
  return db
    .select({ id: S.academicCalendar.id, title: S.academicCalendar.title, tahunAjaran: S.academicCalendar.tahunAjaran, status: S.academicCalendar.status, error: S.academicCalendar.error, createdAt: S.academicCalendar.createdAt })
    .from(S.academicCalendar)
    .where(eq(S.academicCalendar.teacherId, teacherId))
    .orderBy(desc(S.academicCalendar.createdAt));
}
