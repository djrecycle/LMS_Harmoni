/** Prompt and JSON schema for extracting a teacher's weekly teaching schedule (jadwal mengajar) from an uploaded file or photo. */
import { DAYS } from "@/lib/days";

export const SYSTEM =
  "You are an assistant that reads an Indonesian teacher's weekly teaching schedule (jadwal mengajar) from an uploaded document or a photo of a timetable, and turns it into structured JSON, in Indonesian. " +
  "Copy days, times, subjects, and classes from the source as accurately as possible — never invent an entry that is not in the source. " +
  "When a piece of information is missing, leave it empty rather than guessing. Reply with ONLY valid JSON, no explanation, no code fence.";

export const MAX_SOURCE_CHARS = 40_000;

export const SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hari: { type: "string", enum: DAYS as unknown as string[], description: "Day of week, lowercase Indonesian" },
          jam_mulai: { type: "string", description: "HH:MM, 24-hour" },
          jam_selesai: { type: "string", description: "HH:MM, 24-hour" },
          mata_pelajaran: { type: "string" },
          kelas: { type: "string", description: 'Class/grade label exactly as written, e.g. "VII A"' },
          catatan: { type: "string" },
        },
        required: ["hari", "jam_mulai", "jam_selesai", "mata_pelajaran", "kelas", "catatan"],
        additionalProperties: false,
      },
    },
  },
  required: ["entries"],
  additionalProperties: false,
} as const;

/** `sourceText` is empty when the source is a photo — the image itself is sent alongside this prompt. */
export function buildPrompt(sourceText: string): string {
  const hasText = sourceText.trim().length > 0;
  return `${
    hasText
      ? 'Berkas jadwal mengajar berikut adalah dokumen milik seorang guru, hasil ekstraksi otomatis dari berkas yang diunggah (urutan paragraf/tabel apa adanya; isi satu baris tabel dipisah tanda " | ").'
      : "Gambar berikut adalah foto atau tangkapan layar jadwal mengajar milik seorang guru."
  } Tugas Anda HANYA merapikannya ke bentuk JSON terstruktur di bawah — jangan mengubah, mengarang, menambah, atau menghilangkan entri jadwal yang sudah ada.
${hasText ? `\nDokumen sumber:\n---\n${sourceText.slice(0, MAX_SOURCE_CHARS)}\n---\n` : ""}
Ketentuan:
- "hari": salah satu dari senin, selasa, rabu, kamis, jumat, sabtu, minggu (huruf kecil).
- "jam_mulai" dan "jam_selesai": format 24 jam "HH:MM".
- "kelas": label kelas persis seperti di sumber, mis. "VII A" atau "X IPA 2".
- Satu baris jadwal = satu entri, meskipun ada beberapa jam pelajaran berurutan untuk mata pelajaran yang sama pada hari yang sama (gabungkan jadi satu entri dengan jam_mulai dan jam_selesai yang mencakup semuanya).
- Jika suatu bagian tidak ditemukan di sumber, kosongkan ("") — JANGAN mengarang isi baru.

Balas HANYA JSON dengan bentuk:
${JSON.stringify(SCHEMA)}`;
}
