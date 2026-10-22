import { arr, obj, objs, str, type Obj } from "../util";
import { BAGIAN_KOSONG, DPL_STANDAR, normalisasi, templateBawaan, type Template } from "../template";
import { Writer, capitalize, nomorJudul, teks, type Ident } from "./base";

/** What each Modul Ajar section reads while it is written. */
type Ctx = { data: Obj; ident: Ident; mapel: string; tpl: Template; jenis: string; bentuk: string };
type Penulis = (w: Writer, c: Ctx, judul: string) => boolean;

const identitasOf = (c: Ctx) => obj(c.data.identitas);
const nonEmpty = (v: unknown) => Object.keys(obj(v)).length > 0;

/** Print a section title according to its kind (induk/utama/tebal/pemisah). */
function kepala(w: Writer, c: Ctx, judul: string) {
  if (c.jenis === "pemisah") {
    w.p();
    w.p(judul, { bold: true, size: 13, align: "center" });
  } else if (c.jenis === "tebal") w.p(judul, { bold: true });
  else w.p(judul, { bold: true, size: 12 });
}

const bagianJudulSaja: Penulis = (w, c, judul) => {
  kepala(w, c, judul);
  return true;
};

const bagianIdentitas: Penulis = (w, c, judul) => {
  const id = identitasOf(c);
  kepala(w, c, judul);
  w.tabelIdentitas([
    ["Nama Sekolah", str(id.nama_sekolah) || c.ident.nama_sekolah],
    ["Nama Penyusun", str(id.nama_penyusun) || c.ident.nama_guru],
    ["Mata Pelajaran", c.mapel],
    ["Kelas / Fase / Semester", id.kelas_fase_semester],
    ["Alokasi Waktu", id.alokasi_waktu],
    ["Tahun Pelajaran", id.tahun_pelajaran],
  ]);
  w.p();
  return true;
};

const bagianKesiapan: Penulis = (w, c, judul) => {
  const kesiapan = obj(c.data.kesiapan);
  kepala(w, c, judul);
  w.butirNama("Pengetahuan Awal", teks(kesiapan.pengetahuan_awal));
  w.butirNama("Minat", teks(kesiapan.minat));
  w.butirNama("Latar Belakang", teks(kesiapan.latar_belakang));
  const kebutuhan = obj(kesiapan.kebutuhan_belajar);
  if (nonEmpty(kebutuhan)) {
    w.butir("Kebutuhan Belajar:");
    for (const nama of ["visual", "auditori", "kinestetik"]) {
      if (str(kebutuhan[nama])) w.butirNama(capitalize(nama), teks(kebutuhan[nama]), 1);
    }
  }
  return true;
};

const bagianKarakteristik: Penulis = (w, c, judul) => {
  const materi = obj(c.data.karakteristik_materi);
  kepala(w, c, judul);
  if (str(materi.konseptual) || str(materi.prosedural)) {
    w.butir("Jenis Pengetahuan yang Akan Dicapai:");
    w.butirNama("Konseptual", teks(materi.konseptual), 1);
    w.butirNama("Prosedural", teks(materi.prosedural), 1);
  }
  w.butirNama("Relevansi dengan Kehidupan Nyata Peserta Didik", teks(materi.relevansi));
  w.butirNama("Tingkat Kesulitan", teks(materi.tingkat_kesulitan));
  w.butirNama("Struktur Materi", teks(materi.struktur_materi));
  const nilai = objs(materi.integrasi_nilai);
  if (nilai.length) {
    w.butir("Integrasi Nilai dan Karakter:");
    for (const n of nilai) w.butirNama(teks(n.nama), teks(n.uraian), 1);
  }
  return true;
};

const KATA_DPL = ["keimanan", "kewargaan", "penalaran", "kreativitas", "kolaborasi", "kemandirian", "kesehatan", "komunikasi"];

const bagianDimensi: Penulis = (w, c, judul) => {
  kepala(w, c, judul);
  const dimensi = objs(c.data.dimensi_profil_lulusan);
  if (c.bentuk !== "centang") {
    for (const d of dimensi) w.butirNama(teks(d.nama), teks(d.uraian));
    return true;
  }
  const dipilih = new Set<number>();
  const tambahan: string[] = []; // DPL chosen by the AI outside the eight standard ones
  for (const d of dimensi) {
    const nama = teks(d.nama);
    const idx = KATA_DPL.findIndex((k) => nama.toLowerCase().includes(k));
    if (idx === -1) tambahan.push(nama);
    else dipilih.add(idx);
  }
  DPL_STANDAR.forEach((nama, i) => w.kotakCentang(nama, dipilih.has(i)));
  for (const nama of tambahan) w.kotakCentang(nama, true);
  w.p();
  const baris: unknown[][] = dimensi.map((d) => [teks(d.nama), teks(d.alasan || d.uraian), teks(d.penguatan)]);
  while (baris.length < 2) baris.push(["", "", ""]);
  w.tabel(["DPL terpilih", "Alasan pemilihan", "Cara penguatan dalam pembelajaran"], baris, [4.5, 6.0, 6.5]);
  w.p();
  return true;
};

const bagianCp: Penulis = (w, c, judul) => {
  kepala(w, c, judul);
  w.p(teks(c.data.capaian_pembelajaran), { align: "justify" });
  return true;
};

const bagianLintas: Penulis = (w, c, judul) => {
  kepala(w, c, judul);
  for (const d of objs(c.data.lintas_disiplin)) w.butirNama(teks(d.nama), teks(d.uraian));
  return true;
};

const bagianTp: Penulis = (w, c, judul) => {
  kepala(w, c, judul);
  if (c.bentuk === "tabel") {
    w.tabelIdentitas([["CP Rujukan", teks(c.data.capaian_pembelajaran)], ["Tujuan Pembelajaran", teks(c.data.tujuan_pembelajaran)]], true);
    w.p();
    return true;
  }
  for (const tp of arr(c.data.tujuan_pembelajaran)) w.p(teks(tp), { align: "justify" });
  return true;
};

const bagianTopik: Penulis = (w, c, judul) => {
  kepala(w, c, judul);
  w.p(teks(c.data.topik_kontekstual), { align: "justify" });
  return true;
};

// The kerangka is split so it can show whole under one title (kerangka) or as separate sections (its pieces).
type IsiKerangka = (w: Writer, kerangka: Obj, subJudul: boolean) => void;

const isiPedagogik: IsiKerangka = (w, k, subJudul) => {
  if (subJudul) w.p("PRAKTIK PEDAGOGIK", { bold: true });
  if (str(k.model)) w.p(`Model Pembelajaran: ${teks(k.model)}`);
  if (str(k.pendekatan)) w.p(`Pendekatan: ${teks(k.pendekatan)}`);
  for (const [kunci, label] of [["mindful", "Mindful Learning"], ["meaningful", "Meaningful Learning"], ["joyful", "Joyful Learning"]] as const) {
    if (str(k[kunci])) w.butirNama(label, teks(k[kunci]));
  }
  if (str(k.metode)) w.p(`Metode Pembelajaran: ${teks(k.metode)}`);
  const diferensiasi = obj(k.diferensiasi);
  if (nonEmpty(diferensiasi)) {
    w.p("STRATEGI PEMBELAJARAN BERDIFERENSIASI", { bold: true });
    for (const kunci of ["konten", "proses", "produk"]) {
      if (str(diferensiasi[kunci])) w.butirNama(`Diferensiasi ${capitalize(kunci)}`, teks(diferensiasi[kunci]));
    }
  }
};

const isiKemitraan: IsiKerangka = (w, k, subJudul) => {
  const kemitraan = obj(k.kemitraan);
  if (!nonEmpty(kemitraan)) return;
  if (subJudul) w.p("KEMITRAAN PEMBELAJARAN", { bold: true });
  for (const [kunci, label] of [["sekolah", "Lingkungan Sekolah"], ["keluarga", "Lingkungan Keluarga"], ["teman_sebaya", "Teman Sebaya"]] as const) {
    if (str(kemitraan[kunci])) w.butirNama(label, teks(kemitraan[kunci]));
  }
};

const isiLingkungan: IsiKerangka = (w, k, subJudul) => {
  const lingkungan = obj(k.lingkungan);
  if (!nonEmpty(lingkungan)) return;
  if (subJudul) w.p("LINGKUNGAN BELAJAR", { bold: true });
  for (const [kunci, label] of [["fisik", "Ruang Fisik"], ["virtual", "Ruang Virtual"], ["budaya", "Budaya Belajar"]] as const) {
    if (str(lingkungan[kunci])) w.butirNama(label, teks(lingkungan[kunci]));
  }
};

const isiDigital: IsiKerangka = (w, k, subJudul) => {
  const digital = objs(k.digital);
  if (!digital.length) return;
  if (subJudul) w.p("PEMANFAATAN DIGITAL", { bold: true });
  for (const d of digital) w.butirNama(teks(d.nama), teks(d.uraian));
};

const bagianKerangka: Penulis = (w, c, judul) => {
  const kerangka = obj(c.data.kerangka);
  kepala(w, c, judul);
  isiPedagogik(w, kerangka, true);
  isiKemitraan(w, kerangka, true);
  isiLingkungan(w, kerangka, true);
  isiDigital(w, kerangka, true);
  return true;
};

const pecahanKerangka =
  (isi: IsiKerangka): Penulis =>
  (w, c, judul) => {
    kepala(w, c, judul);
    isi(w, obj(c.data.kerangka), false);
    return true;
  };

const bagianLangkah: Penulis = (w, c, judul) => {
  kepala(w, c, judul);
  for (const temu of objs(c.data.pertemuan)) {
    w.p(teks(temu.judul).toUpperCase(), { bold: true, align: "center" });
    if (str(temu.topik)) w.p(`Topik: ${teks(temu.topik).toUpperCase()}`, { bold: true });
    let urutan = 0;
    for (const [kunci, labelAsli] of [["pendahuluan", c.tpl.label_awal], ["inti", c.tpl.label_inti], ["penutup", c.tpl.label_penutup]] as const) {
      const bagian = obj(temu[kunci]);
      if (!nonEmpty(bagian)) continue;
      let label: string = labelAsli;
      if (c.tpl.kegiatan_bernomor) {
        label = nomorJudul(c.tpl.penomoran, urutan) + label;
        urutan += 1;
      }
      const durasi = teks(bagian.durasi);
      w.p(durasi ? `${label} (${durasi})` : label, { bold: true });
      for (const b of objs(bagian.butir)) w.butirNama(teks(b.nama), teks(b.uraian));
      const beda = obj(bagian.diferensiasi);
      if (nonEmpty(beda)) {
        w.butir("Pembelajaran Berdiferensiasi:");
        for (const k of ["konten", "proses", "produk"]) {
          if (str(beda[k])) w.butirNama(capitalize(k), teks(beda[k]), 1);
        }
      }
    }
  }
  return true;
};

const bagianAsesmen: Penulis = (w, c, judul) => {
  const asesmen = obj(c.data.asesmen);
  kepala(w, c, judul);
  if (c.bentuk === "tabel") {
    const baris: unknown[][] = [];
    for (const [kunci, jenis] of [["diagnostik", "Diagnostik"], ["formatif", "Formatif"], ["sumatif", "Sumatif"]] as const) {
      for (const a of objs(asesmen[kunci])) baris.push([teks(a.diukur || a.uraian), jenis, teks(a.teknik || a.nama), teks(a.bentuk)]);
    }
    while (baris.length < 2) baris.push(["….", "", "", ""]);
    w.tabel(["Apa yang akan diukur?", "Jenis Asesmen", "Teknik Asesmen", "Bentuk Asesmen"], baris, [5.5, 2.8, 4.2, 4.5]);
    w.p();
    return true;
  }
  for (const [kunci, label] of [["diagnostik", "ASESMEN DIAGNOSTIK"], ["formatif", "ASESMEN FORMATIF"], ["sumatif", "ASESMEN SUMATIF"]] as const) {
    const isi = objs(asesmen[kunci]);
    if (!isi.length) continue;
    w.p(label, { bold: true });
    for (const a of isi) w.butirNama(teks(a.nama), teks(a.uraian));
  }
  return true;
};

const bagianRubrik: Penulis = (w, c, judul) => {
  const rubrik = obj(c.data.rubrik);
  const aspek = objs(rubrik.aspek);
  if (!aspek.length) return false;
  kepala(w, c, judul);
  w.tabel(
    ["No.", "Aspek", "4 / Sangat Baik", "3 / Baik", "2 / Cukup", "1 / Perlu Bimbingan"],
    aspek.map((a, i) => [teks(a.no || i + 1), teks(a.aspek), teks(a.sangat_baik), teks(a.baik), teks(a.cukup), teks(a.perlu_bimbingan)]),
    [1.0, 3.2, 3.6, 3.4, 3.4, 3.4],
  );
  if (str(rubrik.keterangan)) w.p(teks(rubrik.keterangan), { align: "justify" });
  return true;
};

const bagianTes: Penulis = (w, c, judul) => {
  const tes = obj(c.data.tes);
  const pg = objs(tes.pilihan_ganda);
  const uraian = arr(tes.uraian);
  const tercetak = pg.length > 0 || uraian.length > 0;
  if (tercetak) kepala(w, c, judul);
  if (pg.length) {
    w.p("Pilihan Ganda", { bold: true });
    const kunci: string[] = [];
    pg.forEach((soal, i) => {
      w.p(`${i + 1}. ${teks(soal.soal)}`, { spasi: 1 });
      for (const opsi of arr(soal.opsi)) w.p(teks(opsi), { indent: 0.8, spasi: 0 });
      kunci.push(`${i + 1}) ${teks(soal.kunci)}`);
    });
    w.p(`Kunci Pilihan Ganda: ${kunci.join(", ")}.`);
  }
  if (uraian.length) {
    w.p("Uraian", { bold: true });
    uraian.forEach((soal, i) => w.p(`${i + 1}. ${teks(soal)}`, { align: "justify", spasi: 1 }));
  }
  return tercetak;
};

const bagianTindakLanjut: Penulis = (w, c, judul) => {
  const lanjut = obj(c.data.tindak_lanjut);
  if (!nonEmpty(lanjut)) return false;
  kepala(w, c, judul);
  w.butirNama("Remedial", teks(lanjut.remedial));
  w.butirNama("Pengayaan", teks(lanjut.pengayaan));
  return true;
};

const daftarButir =
  (kunciData: string): Penulis =>
  (w, c, judul) => {
    const isi = arr(c.data[kunciData]);
    if (!isi.length) return false;
    kepala(w, c, judul);
    for (const x of isi) w.butir(teks(x));
    return true;
  };

/** Section key (see template.ts) -> its writer. A writer returns true when it printed its title (used for title numbers). */
const PENULIS_MODUL: Record<string, Penulis> = {
  identitas: bagianIdentitas,
  kesiapan: bagianKesiapan,
  karakteristik: bagianKarakteristik,
  dimensi: bagianDimensi,
  desain: bagianJudulSaja,
  cp: bagianCp,
  lintas: bagianLintas,
  tp: bagianTp,
  topik: bagianTopik,
  kerangka: bagianKerangka,
  pedagogik: pecahanKerangka(isiPedagogik),
  kemitraan: pecahanKerangka(isiKemitraan),
  lingkungan: pecahanKerangka(isiLingkungan),
  digital: pecahanKerangka(isiDigital),
  langkah: bagianLangkah,
  asesmen: bagianAsesmen,
  rubrik: bagianRubrik,
  tes: bagianTes,
  tindak_lanjut: bagianTindakLanjut,
  refleksi_pd: daftarButir("refleksi_peserta_didik"),
  refleksi_guru: daftarButir("refleksi_guru"),
  sumber: daftarButir("sumber_belajar"),
};
for (const k of BAGIAN_KOSONG) PENULIS_MODUL[k] = bagianJudulSaja;

/** Value of a cover identity row, chosen by its label (labels are free text from the template). */
function nilaiIdentitas(label: string, c: Ctx): string {
  const rendah = label.toLowerCase();
  const id = identitasOf(c);
  if (rendah.includes("sekolah")) return teks(id.nama_sekolah || c.ident.nama_sekolah);
  if (rendah.includes("penyusun") || rendah.includes("guru")) return teks(id.nama_penyusun || c.ident.nama_guru);
  if (rendah.includes("mata pelajaran") || rendah.includes("mapel")) return c.mapel;
  if (rendah.includes("fase")) return teks(id.kelas_fase_semester);
  const bagian = teks(id.kelas_fase_semester).split("/").map((x) => x.trim());
  if (rendah.includes("semester")) return bagian.length > 1 ? bagian[bagian.length - 1] : "";
  if (rendah.includes("kelas")) return teks(c.ident.kelas) || bagian[0];
  if (rendah.includes("alokasi")) return teks(id.alokasi_waktu);
  if (rendah.includes("tahun")) return teks(id.tahun_pelajaran);
  if (rendah.includes("topik") || rendah.includes("materi") || rendah.includes("bab")) return teks(c.data.materi_bab || c.data.judul_bab);
  return "";
}

/** Modul Ajar following `template`; without one the built-in template (the app's original look) is used. */
export async function tulisModulAjar(data: Obj, ident: Ident, template?: unknown): Promise<Buffer> {
  const tpl = template ? normalisasi(template) : templateBawaan();
  const w = new Writer(tpl.font, tpl.ukuran, tpl.bullet);
  const identitas = obj(data.identitas);
  const mapel = teks(data.mata_pelajaran || identitas.mata_pelajaran);
  const c: Ctx = { data, ident, mapel, tpl, jenis: "utama", bentuk: "" };

  if (tpl.tampilkan_sampul) {
    w.p(tpl.judul_dokumen, { bold: true, size: 16, align: "center" });
    if (tpl.subjudul) w.p(tpl.subjudul, { bold: true, size: 12, align: "center" });
    w.tabelIdentitas(tpl.identitas_baris.map((label): [string, unknown] => [label, nilaiIdentitas(label, c)]), tpl.identitas_garis);
    w.p();
  }
  if (tpl.judul_sampul) w.p(tpl.judul_sampul, { bold: true, size: 13, align: "center" });
  w.p(`MATA PELAJARAN : ${mapel.toUpperCase()}`, { bold: true, size: 12, align: "center" });
  w.p(teks(data.judul_bab).toUpperCase(), { bold: true, size: 12, align: "center" });
  if (str(data.materi_bab)) w.p(`MATERI : ${teks(data.materi_bab).toUpperCase()}`, { bold: true, size: 11, align: "center" });
  w.p();

  let nInduk = 0;
  let nUtama = 0;
  for (const bagian of tpl.bagian) {
    if (!bagian.aktif) continue;
    const penulis = PENULIS_MODUL[bagian.kunci];
    if (!penulis) continue;
    c.jenis = bagian.jenis;
    c.bentuk = bagian.bentuk;
    let judul = bagian.judul;
    if (bagian.jenis === "induk") judul = nomorJudul(tpl.penomoran_utama, nInduk) + judul;
    else if (bagian.jenis === "utama") judul = nomorJudul(tpl.penomoran, nUtama) + judul;
    if (penulis(w, c, judul)) {
      if (bagian.jenis === "induk") {
        nInduk += 1;
        nUtama = 0;
      } else if (bagian.jenis === "utama") nUtama += 1;
      else if (bagian.jenis === "pemisah") nInduk = nUtama = 0;
    }
  }

  if (tpl.tanda_tangan) w.blokTtd(ident, `Guru Mata Pelajaran ${mapel}`.trim());
  return w.toBuffer();
}

