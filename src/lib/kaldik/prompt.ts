/** Prompt and JSON schema for extracting a Kalender Pendidikan (academic calendar) from an uploaded file. */

export const SYSTEM =
  "You are an assistant that reads an Indonesian school's official academic calendar (Kalender Pendidikan / Kaldik) and tidies it into structured JSON, in Indonesian. " +
  "Copy dates and descriptions from the source as accurately as possible — never invent a date or event that is not in the source text. " +
  "When a piece of information is missing from the source, leave it empty rather than guessing. Reply with ONLY valid JSON, no explanation, no code fence.";

export const MAX_SOURCE_CHARS = 60_000;

export const SCHEMA = {
  type: "object",
  properties: {
    tahun_ajaran: { type: "string", description: 'e.g. "2026/2027"' },
    catatan: { type: "string", description: "Any general note from the source that does not fit elsewhere" },
    semester: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nama: { type: "string", description: 'e.g. "Semester 1 (Ganjil)"' },
          mulai: { type: "string", description: "YYYY-MM-DD, empty if unknown" },
          selesai: { type: "string", description: "YYYY-MM-DD, empty if unknown" },
          minggu_efektif: { type: "string" },
          hari_efektif: { type: "string" },
          kegiatan: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tanggal_mulai: { type: "string", description: "YYYY-MM-DD" },
                tanggal_selesai: { type: "string", description: "YYYY-MM-DD, same as tanggal_mulai for a single day" },
                keterangan: { type: "string" },
                jenis: { type: "string", enum: ["libur", "efektif", "ujian", "pts", "pas", "lainnya"] },
              },
              required: ["tanggal_mulai", "tanggal_selesai", "keterangan", "jenis"],
              additionalProperties: false,
            },
          },
        },
        required: ["nama", "mulai", "selesai", "minggu_efektif", "hari_efektif", "kegiatan"],
        additionalProperties: false,
      },
    },
    libur_nasional: {
      type: "array",
      items: {
        type: "object",
        properties: { tanggal: { type: "string", description: "YYYY-MM-DD" }, keterangan: { type: "string" } },
        required: ["tanggal", "keterangan"],
        additionalProperties: false,
      },
    },
  },
  required: ["tahun_ajaran", "catatan", "semester", "libur_nasional"],
  additionalProperties: false,
} as const;

export function buildPrompt(sourceText: string): string {
  return `Berkas Kalender Pendidikan berikut adalah dokumen resmi milik sekolah, hasil ekstraksi otomatis dari berkas yang diunggah guru (urutan paragraf/tabel apa adanya; isi satu baris tabel dipisah tanda " | "). Tugas Anda HANYA merapikannya ke bentuk JSON terstruktur di bawah — jangan mengubah, mengarang, menambah, atau menghilangkan tanggal maupun kegiatan yang sudah ada.

Dokumen sumber:
---
${sourceText.slice(0, MAX_SOURCE_CHARS)}
---

Ketentuan:
- Semua tanggal dalam format YYYY-MM-DD. Jika tahun tidak tertulis eksplisit pada suatu baris, simpulkan dari tahun ajaran/semester yang sedang dibahas di sekitarnya.
- "jenis" kegiatan: "libur" (libur nasional/sekolah), "efektif" (hari/minggu efektif belajar), "ujian" (ujian sekolah/ujian akhir), "pts" (penilaian tengah semester), "pas" (penilaian akhir semester), atau "lainnya".
- Jika suatu bagian tidak ditemukan di sumber, kosongkan ("" atau daftar kosong) — JANGAN mengarang isi baru.

Balas HANYA JSON dengan bentuk:
${JSON.stringify(SCHEMA)}`;
}
