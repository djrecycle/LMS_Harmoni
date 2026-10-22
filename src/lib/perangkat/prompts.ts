/**
 * Prompt builders for the teaching documents (port of core/prompt_ajar.py).
 * Wording and JSON shapes are kept as in the original app; only the Form A/B (observation) parts are gone.
 * The writing style follows the teacher's own sample files in ./assets.ts.
 */
import { CONTOH_CP_TP_ATP, CONTOH_MODUL_AJAR } from "./assets";
import { arr, isObj, obj, str, strs, type Obj } from "./util";
import {
  BATAS_CONTOH,
  DPL_STANDAR,
  apakahBawaan,
  bagianAktif,
  bentukBagian,
  kunciJsonNonaktif,
  normalisasi,
  templateBawaan,
  type Template,
} from "./template";

export const BATAS_IMPOR = 60000; // characters of an uploaded source text placed in the prompt

export const SISTEM =
  "Anda adalah guru senior sekaligus pengembang kurikulum di sekolah menengah " +
  "Indonesia yang menguasai Kurikulum Merdeka dan pendekatan Pembelajaran " +
  "Mendalam (Deep Learning: mindful, meaningful, joyful). Anda menulis dokumen " +
  "kurikulum dalam bahasa Indonesia baku, ringkas, konkret, dan siap pakai. " +
  "Jawab HANYA dengan JSON valid tanpa penjelasan, tanpa pagar kode.";

const contoh = (teks: string) => teks.slice(0, BATAS_CONTOH);

/** Context values a teacher fills in (school, subject, class, topic, ...). */
export type Konteks = {
  nama_sekolah?: string;
  nama_guru?: string;
  mata_pelajaran?: string;
  kelas?: string;
  fase?: string;
  semester?: string;
  tahun_ajaran?: string;
  alokasi_waktu?: string;
  topik?: string;
  tujuan_pembelajaran?: string;
  bab_nomor?: string | number;
  jumlah_tp?: string | number;
  catatan?: string;
};

export function konteksTeks(k: Konteks): string {
  const v = (x: unknown) => (x === undefined || x === null ? "" : String(x));
  const baris = [
    `- Satuan pendidikan: ${v(k.nama_sekolah)}`,
    `- Nama guru penyusun: ${v(k.nama_guru)}`,
    `- Mata pelajaran: ${v(k.mata_pelajaran)}`,
    `- Kelas: ${v(k.kelas)}`,
    `- Fase: ${v(k.fase)}`,
    `- Semester: ${v(k.semester)}`,
    `- Tahun ajaran: ${v(k.tahun_ajaran)}`,
    `- Alokasi waktu: ${v(k.alokasi_waktu)}`,
  ];
  if (k.topik) baris.push(`- Topik/bab yang diminta: ${k.topik}`);
  if (k.tujuan_pembelajaran) baris.push(`- Tujuan pembelajaran acuan: ${k.tujuan_pembelajaran}`);
  if (k.bab_nomor) {
    baris.push(
      `- Nomor BAB modul ajar ini WAJIB "BAB ${k.bab_nomor}" (disamakan dengan ` + `nomor UNIT pada ATP CP-TP-ATP yang memuat TP acuan di atas).`,
    );
  }
  if (k.jumlah_tp) baris.push(`- Perkiraan jumlah tujuan pembelajaran satu tahun: ${k.jumlah_tp}`);
  if (k.catatan) baris.push(`- Catatan tambahan dari guru: ${k.catatan}`);
  // keep only lines whose value (after the first ": ") is not empty
  return baris
    .filter((b) => {
      const i = b.indexOf(": ");
      return (i === -1 ? b : b.slice(i + 2)).trim() !== "";
    })
    .join("\n");
}

/* ------------------------------------------------------------------ CP - TP - ATP */
export const SKEMA_CP = `{
  "mata_pelajaran": "SENI BUDAYA (SENI MUSIK)",
  "identitas": {
    "satuan_pendidikan": "...",
    "kelas_semester": "VII / GANJIL (I) DAN GENAP (II)",
    "fase_tahun_ajaran": "D / 2026-2027"
  },
  "catatan_atp": "kalimat pengantar alur, mis. 'Alur disusun dari kemampuan dasar menuju ...'",
  "cp_tp": [
    {
      "no": 1,
      "elemen": "Mengalami (Experiencing)",
      "subelemen": "fokus kompetensi elemen ini",
      "capaian_pembelajaran": "Pada akhir Fase D, murid mampu ...",
      "materi": ["1. ...", "2. ..."],
      "tujuan_pembelajaran": ["TP 1. Murid mampu ...", "TP 2. Murid mampu ..."]
    }
  ],
  "atp": [
    {
      "semester": "SEMESTER 1",
      "keterangan": "Jumlah minggu efektif: 14 minggu | Alokasi waktu: 14 x 2 JP = 28 JP",
      "unit": [
        {
          "nama": "UNIT 1 - EKSPLORASI BUNYI DAN UNSUR MUSIK",
          "baris": [{"urutan": "1", "tujuan": "TP 1 - ...", "alokasi": "2 JP"}]
        }
      ],
      "total": "TOTAL SEMESTER 1: 28 JP"
    }
  ],
  "rekapitulasi": [
    {"semester": "Semester 1", "jumlah_tp": "TP 1-TP 14", "minggu": "14 minggu", "alokasi": "28 JP"}
  ]
}`;

/** CP-TP-ATP built on the official CP text uploaded by the teacher: the CP is copied, only TP and ATP are drafted. */
export function promptCpTpAtp(k: Konteks, cpResmi: string): string {
  return `Susun dokumen CP - TP - ATP (Capaian Pembelajaran, Tujuan Pembelajaran,
dan Alur Tujuan Pembelajaran) untuk satu tahun ajaran.

Konteks:
${konteksTeks(k)}

Dokumen Capaian Pembelajaran (CP) RESMI dari pemerintah, diunggah guru (hasil
ekstraksi otomatis dari berkas; isi satu baris tabel dipisah tanda " | "):
---
${cpResmi.slice(0, BATAS_IMPOR)}
---

Ketentuan CP (WAJIB):
- Elemen dan "capaian_pembelajaran" DISALIN PERSIS dari dokumen CP resmi di atas,
  kata per kata. JANGAN mengarang, meringkas, atau mengubah redaksi CP.
- Pakai HANYA CP untuk fase yang sesuai konteks (mis. Fase D untuk kelas VII-IX).
  Jika dokumen memuat beberapa fase atau mata pelajaran, ambil bagian yang cocok saja.
- Gunakan elemen persis seperti yang tertulis di dokumen CP resmi.
- TP dan materi DITURUNKAN dari CP resmi tersebut; jangan menambah kompetensi
  yang tidak ada di CP.
- Nomor TP berurutan satu tahun (TP 1, TP 2, ...) dan dipakai konsisten pada ATP.
- ATP dibagi per semester, tiap semester berisi beberapa unit, tiap baris memuat
  urutan, tujuan pembelajaran ringkas, dan alokasi JP.
- Jumlah JP tiap semester harus konsisten dengan jumlah TP dan minggu efektif.
- Bahasa Indonesia baku, ringkas, dan langsung pakai.

Ikuti gaya penulisan contoh berikut (contoh milik guru yang sama, jangan disalin
mentah-mentah, sesuaikan dengan konteks di atas):
---
${contoh(CONTOH_CP_TP_ATP)}
---

Balas HANYA JSON dengan bentuk:
${SKEMA_CP}`;
}

export function promptImporCpTpAtp(k: Konteks, teksSumber: string): string {
  return `Teks di bawah ini ADALAH dokumen CP - TP - ATP (Capaian Pembelajaran,
Tujuan Pembelajaran, dan Alur Tujuan Pembelajaran) milik guru sendiri yang
SUDAH ADA sebelumnya — diambil dari berkas yang diunggah guru. TUGAS ANDA
HANYA merapikan/menyusunnya ke bentuk JSON terstruktur di bawah. JANGAN
mengubah, mengarang, menambah, atau menghilangkan isi CP/TP/ATP yang sudah
ada; salin isinya apa adanya, boleh merapikan ejaan/format bila jelas typo
atau rusak akibat proses ekstraksi.

Konteks tambahan (pakai HANYA untuk melengkapi bagian identitas yang kosong
pada dokumen sumber; JANGAN dipakai untuk mengubah isi CP/TP/ATP yang sudah
ada di dokumen sumber):
${konteksTeks(k)}

Dokumen CP-TP-ATP sumber (hasil ekstraksi otomatis dari berkas guru; urutan
paragraf/tabel apa adanya; isi satu baris tabel dipisah tanda " | "):
---
${teksSumber.slice(0, BATAS_IMPOR)}
---

Ketentuan:
- Jika suatu bagian skema di bawah tidak ditemukan pada dokumen sumber (mis.
  "rekapitulasi"), boleh dikosongkan ("" atau daftar kosong) — JANGAN mengarang
  isi baru untuk mengisinya.
- Nomor TP, judul UNIT/BAB, urutan ATP, dan alokasi JP disalin PERSIS seperti
  pada dokumen sumber, jangan diubah atau disusun ulang.
- Bila dokumen sumber memakai istilah/struktur yang sedikit berbeda dari
  skema (mis. "Bab" alih-alih "Unit"), petakan ke kunci JSON yang paling
  sesuai tanpa mengubah maknanya.

Balas HANYA JSON dengan bentuk:
${SKEMA_CP}`;
}

/* ------------------------------------------------------------------ Modul Ajar */
export const SKEMA_MODUL = `{
  "judul_bab": "BAB 1 : EKSPLORASI BUNYI DAN SUMBER BUNYI",
  "mata_pelajaran": "SENI BUDAYA (SENI MUSIK)",
  "identitas": {
    "nama_sekolah": "...", "nama_penyusun": "...", "mata_pelajaran": "...",
    "kelas_fase_semester": "VII / D / I (Ganjil)",
    "alokasi_waktu": "2 JP (1 kali pertemuan @ 2 JP / 80 menit)",
    "tahun_pelajaran": "2026 / 2027"
  },
  "kesiapan": {
    "pengetahuan_awal": "...", "minat": "...", "latar_belakang": "...",
    "kebutuhan_belajar": {"visual": "...", "auditori": "...", "kinestetik": "..."}
  },
  "karakteristik_materi": {
    "konseptual": "...", "prosedural": "...", "relevansi": "...",
    "tingkat_kesulitan": "...", "struktur_materi": "...",
    "integrasi_nilai": [{"nama": "Penalaran Kritis", "uraian": "..."}]
  },
  "dimensi_profil_lulusan": [{"nama": "Penalaran Kritis", "uraian": "..."}],
  "capaian_pembelajaran": "Elemen Mengalami (Experiencing): Pada akhir Fase D, ...",
  "lintas_disiplin": [{"nama": "Ilmu Pengetahuan Alam", "uraian": "..."}],
  "tujuan_pembelajaran": ["TP 1. Peserta didik mampu ..."],
  "topik_kontekstual": "\\u201cBunyi di Sekitarku\\u201d: ...",
  "kerangka": {
    "model": "...", "pendekatan": "...",
    "mindful": "...", "meaningful": "...", "joyful": "...", "metode": "...",
    "diferensiasi": {"konten": "...", "proses": "...", "produk": "..."},
    "kemitraan": {"sekolah": "...", "keluarga": "...", "teman_sebaya": "..."},
    "lingkungan": {"fisik": "...", "virtual": "...", "budaya": "..."},
    "digital": [{"nama": "Audio/Audio Visual", "uraian": "..."}]
  },
  "pertemuan": [{
    "judul": "PERTEMUAN 1 (2 JP : 80 MENIT)", "topik": "BUNYI DI SEKITARKU",
    "pendahuluan": {"durasi": "10 MENIT", "butir": [{"nama": "Orientasi", "uraian": "..."}]},
    "inti": {"durasi": "60 MENIT", "butir": [{"nama": "Memahami - ...", "uraian": "..."}],
             "diferensiasi": {"konten": "...", "proses": "...", "produk": "..."}},
    "penutup": {"durasi": "10 MENIT", "butir": [{"nama": "Refleksi Kelas", "uraian": "..."}]}
  }],
  "asesmen": {
    "diagnostik": [{"nama": "Tanya Jawab", "uraian": "..."}],
    "formatif": [{"nama": "Observasi", "uraian": "..."}],
    "sumatif": [{"nama": "Produk dan Kinerja Kelompok", "uraian": "..."}]
  },
  "rubrik": {
    "aspek": [{"no": "1", "aspek": "Ketepatan identifikasi",
               "sangat_baik": "...", "baik": "...", "cukup": "...", "perlu_bimbingan": "..."}],
    "keterangan": "Skor maksimal = 16. Nilai akhir = (skor perolehan / 16) x 100. ..."
  },
  "tes": {
    "pilihan_ganda": [{"soal": "...", "opsi": ["a. ...", "b. ...", "c. ...", "d. ..."], "kunci": "b"}],
    "uraian": ["..."]
  },
  "tindak_lanjut": {"remedial": "...", "pengayaan": "..."},
  "refleksi_peserta_didik": ["..."],
  "refleksi_guru": ["..."],
  "sumber_belajar": ["..."]
}`;

/** Pieces of the Modul Ajar prompt that depend on the chosen template. For the built-in template they are the original wording. */
function blokTemplateModul(tpl: Template): { ketentuan: string; pengantar: string; contoh: string } {
  const bawaan = apakahBawaan(tpl) || !tpl.gaya_contoh.trim();
  const ketentuan: string[] = [
    "- Kegiatan inti memakai sintaks memahami - mengaplikasikan - merefleksikan,\n  dengan pembagian menit yang jumlahnya pas dengan alokasi waktu.\n",
    "- Sertakan pembelajaran berdiferensiasi (konten, proses, produk) yang konkret.\n",
  ];
  if (bagianAktif(tpl, "rubrik")) {
    ketentuan.push("- Rubrik memakai empat tingkat (4 Sangat Baik, 3 Baik, 2 Cukup, 1 Perlu Bimbingan)\n  dan minimal empat aspek.\n");
  }
  if (bagianAktif(tpl, "tes")) ketentuan.push("- Sertakan 5 soal pilihan ganda beserta kunci dan 2 soal uraian.\n");
  ketentuan.push("- Bahasa Indonesia baku, kalimat lugas, tanpa singkatan yang tidak lazim.\n");

  if (bentukBagian(tpl, "dimensi") === "centang") {
    ketentuan.push(
      "- Dimensi Profil Lulusan ditampilkan sebagai kotak centang dan tabel isian. Pilih PALING " +
        'BANYAK 2 dimensi yang paling dikuatkan oleh TP dan materi, dan tulis "nama"-nya persis ' +
        "salah satu dari: " +
        DPL_STANDAR.join("; ") +
        '. Pada setiap butir "dimensi_profil_lulusan" isi juga kunci "alasan" (mengapa dimensi itu relevan dengan ' +
        'TP, materi, dan kebutuhan murid) dan "penguatan" (aktivitas/metode/penugasan yang ' +
        "membuat dimensi itu tampak dan dapat diamati).\n",
    );
  }
  if (bentukBagian(tpl, "asesmen") === "tabel") {
    ketentuan.push(
      '- Asesmen ditampilkan sebagai tabel isian. Pada setiap butir di "diagnostik", ' +
        '"formatif", dan "sumatif" isi juga kunci "diukur" (indikator atau bukti yang ' +
        'diukur), "teknik" (cara memperoleh bukti belajar, mis. observasi, tanya jawab), dan ' +
        '"bentuk" (wujud tugas atau respons murid, mis. lembar pengamatan, unjuk kerja).\n',
    );
  }

  const nonaktif = kunciJsonNonaktif(tpl);
  if (nonaktif.length) {
    ketentuan.push(
      "- Template ini TIDAK memuat bagian berikut pada dokumennya. Isi kuncinya dengan " +
        'nilai kosong ("", [] atau {}) dan jangan menulis isinya: ' +
        nonaktif.join(", ") +
        ".\n",
    );
  }
  if (tpl.instruksi.trim()) {
    ketentuan.push(
      `- Ketentuan tambahan dari template "${tpl.nama}" (WAJIB diikuti):\n` +
        tpl.instruksi
          .trim()
          .split(/\r?\n/)
          .filter((b) => b.trim())
          .map((b) => `  ${b}`)
          .join("\n") +
        "\n",
    );
  }

  if (bawaan) {
    return {
      ketentuan: ketentuan.join(""),
      pengantar: "Ikuti gaya penulisan contoh berikut (contoh milik guru yang sama, jangan disalin\nmentah-mentah, sesuaikan dengan konteks di atas):",
      contoh: !tpl.gaya_contoh.trim() ? contoh(CONTOH_MODUL_AJAR) : tpl.gaya_contoh.slice(0, BATAS_CONTOH),
    };
  }
  return {
    ketentuan: ketentuan.join(""),
    pengantar:
      `Ikuti gaya penulisan contoh berikut (contoh dari template "${tpl.nama}";\n` +
      "ambil HANYA gaya bahasa, kedalaman uraian, dan panjang tulisannya. Struktur JSON\n" +
      "jawaban tetap mengikuti bentuk di bawah, jangan disalin mentah-mentah,\n" +
      "sesuaikan dengan konteks di atas):",
    contoh: tpl.gaya_contoh.slice(0, BATAS_CONTOH),
  };
}

export function promptModulAjar(k: Konteks, template?: unknown): string {
  const tpl = template ? normalisasi(template) : templateBawaan();
  const blok = blokTemplateModul(tpl);
  return `Susun satu Modul Ajar Kurikulum Merdeka dengan pendekatan Pembelajaran
Mendalam (Deep Learning) yang lengkap dan siap dipakai mengajar.

Konteks:
${konteksTeks(k)}

Ketentuan:
- Modul untuk satu tujuan pembelajaran (satu bab) sesuai topik/TP pada konteks.
${blok.ketentuan}
${blok.pengantar}
---
${blok.contoh}
---

Balas HANYA JSON dengan bentuk:
${SKEMA_MODUL}`;
}

/* ------------------------------------------------------------------ Materi Lengkap (Guru & Siswa) */
/** Summarise a saved Modul Ajar into the reference block for the teacher's material. */
export function materiDariModul(sumber: Obj): string {
  const baris = [`Judul BAB: ${str(sumber.judul_bab)}`, `Mata Pelajaran: ${str(sumber.mata_pelajaran)}`];
  if (str(sumber.materi_bab)) baris.push(`Materi/Topik: ${str(sumber.materi_bab)}`);
  if (str(sumber.capaian_pembelajaran)) baris.push(`Capaian Pembelajaran: ${str(sumber.capaian_pembelajaran)}`);
  const tp = strs(sumber.tujuan_pembelajaran);
  if (tp.length) baris.push("Tujuan Pembelajaran:\n" + tp.map((t) => `- ${t}`).join("\n"));
  if (str(sumber.topik_kontekstual)) baris.push(`Topik Kontekstual: ${str(sumber.topik_kontekstual)}`);
  const karakteristik = obj(sumber.karakteristik_materi);
  const sub = (
    [
      ["konseptual", "Konseptual"],
      ["prosedural", "Prosedural"],
      ["relevansi", "Relevansi dengan kehidupan nyata"],
      ["struktur_materi", "Struktur materi"],
    ] as const
  )
    .filter(([kunci]) => str(karakteristik[kunci]))
    .map(([kunci, label]) => `  ${label}: ${str(karakteristik[kunci])}`);
  if (sub.length) baris.push("Karakteristik Materi (dari Modul Ajar):\n" + sub.join("\n"));
  const isiInti: string[] = [];
  for (const temu of arr(sumber.pertemuan)) {
    if (!isObj(temu)) continue;
    for (const b of arr(obj(temu.inti).butir)) {
      if (isObj(b)) isiInti.push(`- [${str(temu.judul)}] ${str(b.nama)}: ${str(b.uraian)}`);
    }
  }
  if (isiInti.length) baris.push("Cakupan Kegiatan Inti (acuan kedalaman & urutan materi):\n" + isiInti.join("\n"));
  const sb = strs(sumber.sumber_belajar);
  if (sb.length) baris.push("Sumber Belajar:\n" + sb.map((s) => `- ${s}`).join("\n"));
  return baris.join("\n\n");
}

export const SKEMA_MATERI_GURU = `{
  "judul": "MATERI PEMBELAJARAN: EKSPLORASI BUNYI DAN SUMBER BUNYI",
  "mata_pelajaran": "SENI BUDAYA (SENI MUSIK)",
  "bab": "BAB 1 : EKSPLORASI BUNYI DAN SUMBER BUNYI",
  "pengantar": "paragraf pembuka yang menjelaskan cakupan dan tujuan materi ini",
  "bagian": [
    {
      "judul": "1. Judul Sub Materi",
      "paragraf": ["paragraf penjelasan pertama ...", "paragraf penjelasan kedua ..."],
      "poin_penting": ["poin penting yang perlu digarisbawahi", "..."]
    }
  ],
  "istilah_penting": [{"istilah": "...", "arti": "penjelasan singkat istilah tersebut"}],
  "rangkuman": ["kalimat rangkuman 1", "kalimat rangkuman 2"],
  "sumber_belajar": ["..."],
  "lkpd": {
    "judul": "LKPD: EKSPLORASI BUNYI DAN SUMBER BUNYI",
    "petunjuk": "Kerjakan soal berikut secara mandiri berdasarkan materi di atas.",
    "pilihan_ganda": [
      {
        "no": 1,
        "soal": "soal bertipe HOTS: analisis/penerapan pada situasi baru/pemecahan masalah, bukan hafalan",
        "opsi": ["a. ...", "b. ...", "c. ...", "d. ..."],
        "kunci": "b",
        "pembahasan": "alasan singkat mengapa kunci itu benar dan opsi lain salah"
      }
    ],
    "uraian": [
      {
        "no": 1,
        "soal": "soal uraian bertipe HOTS: analisis kasus/evaluasi/pemecahan masalah kontekstual",
        "kunci_jawaban": "jawaban model/rubrik singkat untuk penilaian"
      }
    ]
  }
}`;

export function promptMateriGuru(k: Konteks, sumberModul: Obj): string {
  return `Susun MATERI PEMBELAJARAN LENGKAP untuk guru berdasarkan Modul Ajar yang
sudah dibuat sebelumnya. Materi ini menjadi bahan bacaan utama guru sebelum
mengajar: rapi, terstruktur per subbab, mendalam, dan akurat secara keilmuan.
Materi ini juga dilengkapi LKPD (Lembar Kerja Peserta Didik) beserta kunci
jawabannya untuk guru.

Konteks:
${konteksTeks(k)}

Acuan Modul Ajar yang sudah digenerate (materi dan LKPD WAJIB konsisten dengan
BAB, tujuan pembelajaran, dan cakupan kegiatan inti di bawah ini, jangan
menyimpang ke topik lain):
---
${materiDariModul(sumberModul)}
---

Ketentuan Materi:
- Uraikan materi menjadi beberapa "bagian" (subbab) berurutan secara logis,
  mengikuti urutan cakupan kegiatan inti pada Modul Ajar.
- Setiap bagian ditulis dalam beberapa paragraf yang mengalir dan mendalam
  (bukan sekadar poin), bahasa baku, jelas, dan bisa langsung dibaca guru.
- Sertakan istilah-istilah penting beserta artinya, dan rangkuman akhir materi.
- Jangan mengarang informasi di luar cakupan Modul Ajar acuan; boleh memperluas
  penjelasan konsep yang sudah disebutkan, tapi tidak menambah topik baru.

Ketentuan LKPD ("lkpd"):
- Wajib 10 soal pilihan ganda dan 5 soal uraian, SELURUHNYA bertipe HOTS
  (Higher Order Thinking Skills): soal menuntut analisis, evaluasi, penerapan
  konsep pada situasi/kasus baru, atau pemecahan masalah kontekstual — BUKAN
  sekadar mengingat definisi atau fakta hafalan.
- Soal harus berdasarkan materi di atas, jangan keluar dari cakupan materi.
- Setiap soal pilihan ganda punya 4 opsi (a-d), "kunci" jawaban benar, dan
  "pembahasan" singkat yang menjelaskan alasannya.
- Setiap soal uraian dilengkapi "kunci_jawaban" berupa jawaban model/rubrik
  singkat yang bisa dipakai guru untuk menilai.
- Nomori soal berurutan mulai dari 1 pada masing-masing jenis soal.

Bahasa Indonesia baku dan siap pakai.

Balas HANYA JSON dengan bentuk:
${SKEMA_MATERI_GURU}`;
}

/** Turn the saved Materi Lengkap (Guru) into reference text for the student version. */
export function materiGuruTeks(mg: Obj): string {
  const baris = [`Judul: ${str(mg.judul)}`, `Mata Pelajaran: ${str(mg.mata_pelajaran)}`];
  if (str(mg.pengantar)) baris.push(`Pengantar: ${str(mg.pengantar)}`);
  for (const bagian of arr(mg.bagian)) {
    if (!isObj(bagian)) continue;
    const isi = [`Subbab: ${str(bagian.judul)}`];
    isi.push(...strs(bagian.paragraf));
    isi.push(...strs(bagian.poin_penting).map((p) => `Poin penting: ${p}`));
    baris.push(isi.join("\n"));
  }
  const istilah = arr(mg.istilah_penting).filter(isObj);
  if (istilah.length) baris.push("Istilah penting:\n" + istilah.map((i) => `- ${str(i.istilah)}: ${str(i.arti)}`).join("\n"));
  const rangkuman = strs(mg.rangkuman);
  if (rangkuman.length) baris.push("Rangkuman guru:\n" + rangkuman.map((r) => `- ${r}`).join("\n"));
  const lkpd = obj(mg.lkpd);
  const pg = arr(lkpd.pilihan_ganda).filter(isObj);
  if (pg.length) {
    // Deliberately WITHOUT "kunci"/"pembahasan" so the teacher's answer key never reaches the student version's context.
    baris.push(
      "Soal LKPD Pilihan Ganda (guru, tanpa kunci jawaban) — salin persis nomor, teks soal, dan opsinya:\n" +
        pg.map((p) => `${str(p.no)}. ${str(p.soal)}\n   ` + strs(p.opsi).join("  ")).join("\n"),
    );
  }
  const uraian = arr(lkpd.uraian).filter(isObj);
  if (uraian.length) {
    baris.push("Soal LKPD Uraian (guru, tanpa kunci jawaban) — salin persis nomor dan teks soalnya:\n" + uraian.map((u) => `${str(u.no)}. ${str(u.soal)}`).join("\n"));
  }
  if (str(lkpd.judul) || str(lkpd.petunjuk)) baris.push(`Judul LKPD: ${str(lkpd.judul)}\nPetunjuk LKPD: ${str(lkpd.petunjuk)}`);
  return baris.join("\n\n");
}

export const SKEMA_MATERI_SISWA = `{
  "judul": "MATERI UNTUK SISWA: EKSPLORASI BUNYI DAN SUMBER BUNYI",
  "mata_pelajaran": "SENI BUDAYA (SENI MUSIK)",
  "bab": "BAB 1 : EKSPLORASI BUNYI DAN SUMBER BUNYI",
  "pengantar": "kalimat pembuka singkat, ramah, dan mudah dipahami siswa",
  "bagian": [
    {
      "judul": "1. Judul Sub Materi (bahasa sederhana)",
      "poin": ["poin singkat 1", "poin singkat 2", "poin singkat 3"]
    }
  ],
  "istilah_penting": [{"istilah": "...", "arti": "arti sederhana, mudah diingat siswa"}],
  "rangkuman": ["poin rangkuman 1", "poin rangkuman 2"],
  "lkpd": {
    "judul": "LKPD: EKSPLORASI BUNYI DAN SUMBER BUNYI",
    "petunjuk": "Kerjakan soal berikut secara mandiri berdasarkan materi di atas.",
    "pilihan_ganda": [
      {"no": 1, "soal": "sama persis dengan soal guru", "opsi": ["a. ...", "b. ...", "c. ...", "d. ..."]}
    ],
    "uraian": [
      {"no": 1, "soal": "sama persis dengan soal guru"}
    ]
  }
}`;

export function promptMateriSiswa(k: Konteks, materiGuru: Obj): string {
  return `Ubah MATERI PEMBELAJARAN untuk guru berikut menjadi MATERI UNTUK SISWA
yang lebih sederhana, singkat, dan mudah dipahami, dalam bentuk poin-poin.

Konteks:
${konteksTeks(k)}

Materi Lengkap (Guru) yang sudah dibuat — versi siswa WAJIB sesuai dan tidak
boleh bertentangan atau menambah informasi baru di luar materi ini, hanya
menyederhanakan bahasa dan menyusunnya jadi poin-poin:
---
${materiGuruTeks(materiGuru)}
---

Ketentuan:
- Pakai bahasa sehari-hari yang akrab bagi siswa, kalimat pendek, hindari
  istilah rumit tanpa penjelasan.
- Setiap "bagian" (subbab) SAMA urutan dan cakupannya dengan materi guru,
  tetapi isinya berupa poin-poin singkat (bukan paragraf panjang), 3-6 poin
  tiap bagian.
- "istilah_penting" memuat istilah yang sama dengan materi guru, artinya
  disederhanakan.
- "rangkuman" berisi poin-poin inti yang wajib diingat siswa setelah belajar.
- Bahasa Indonesia baku tapi santai dan mudah dipahami siswa.
- "lkpd": salin PERSIS nomor, teks soal, dan opsi pilihan ganda dari soal LKPD
  guru di atas (10 pilihan ganda, 5 uraian), TANPA mengubah, menambah, atau
  mengurangi soal. JANGAN menyertakan kunci jawaban atau pembahasan apa pun —
  siswa hanya menerima daftar soal untuk dikerjakan.

Balas HANYA JSON dengan bentuk:
${SKEMA_MATERI_SISWA}`;
}
