import { arr, obj, objs, str, strs, type Obj } from "../util";
import { Writer, teks, type Ident } from "./base";

/**
 * Worksheet (LKPD): 10 multiple choice + 5 essay, HOTS. `sertakanKunci` decides whether the answer key and
 * explanations are written (teacher: yes; student: never).
 */
function bagianLkpd(w: Writer, lkpd: Obj, sertakanKunci: boolean) {
  const pilihanGanda = objs(lkpd.pilihan_ganda);
  const uraian = objs(lkpd.uraian);
  if (!pilihanGanda.length && !uraian.length) return;

  w.pageBreak();
  w.p("LEMBAR KERJA PESERTA DIDIK (LKPD)", { bold: true, size: 14, align: "center" });
  if (str(lkpd.judul)) w.p(teks(lkpd.judul).toUpperCase(), { bold: true, size: 12, align: "center" });
  w.p();
  if (str(lkpd.petunjuk)) {
    w.p(teks(lkpd.petunjuk), { align: "justify" });
    w.p();
  }

  if (pilihanGanda.length) {
    w.p("A. PILIHAN GANDA", { bold: true, size: 12 });
    for (const soal of pilihanGanda) {
      w.p(`${teks(soal.no)}. ${teks(soal.soal)}`, { spasi: 1 });
      for (const opsi of arr(soal.opsi)) w.p(teks(opsi), { indent: 0.8, spasi: 0 });
      w.p("", { spasi: 4 });
    }
    if (sertakanKunci) {
      w.p("Kunci Jawaban dan Pembahasan — Pilihan Ganda", { bold: true });
      for (const soal of pilihanGanda) {
        w.p(`${teks(soal.no)}) Kunci: ${teks(soal.kunci).toUpperCase()}`, { spasi: 1 });
        if (str(soal.pembahasan)) w.p(`Pembahasan: ${teks(soal.pembahasan)}`, { indent: 0.8, align: "justify", spasi: 4 });
      }
      w.p();
    }
  }

  if (uraian.length) {
    w.p("B. URAIAN", { bold: true, size: 12 });
    for (const soal of uraian) w.p(`${teks(soal.no)}. ${teks(soal.soal)}`, { align: "justify", spasi: 4 });
    if (sertakanKunci) {
      w.p("Kunci Jawaban — Uraian", { bold: true });
      for (const soal of uraian) {
        if (str(soal.kunci_jawaban)) w.p(`${teks(soal.no)}. ${teks(soal.kunci_jawaban)}`, { align: "justify", spasi: 4 });
      }
    }
  }
}

function judulMateri(w: Writer, judulDokumen: string, data: Obj) {
  w.p(judulDokumen, { bold: true, size: 15, align: "center" });
  w.p(teks(data.mata_pelajaran).toUpperCase(), { bold: true, size: 12, align: "center" });
  if (str(data.bab)) w.p(teks(data.bab).toUpperCase(), { bold: true, size: 12, align: "center" });
  w.p(teks(data.judul).toUpperCase(), { bold: true, size: 13, align: "center" });
  w.p();
}

/** Full material for the teacher, with the LKPD and its answer key (port of tulis_materi_guru). */
export async function tulisMateriGuru(data: Obj, ident: Ident): Promise<Buffer> {
  const w = new Writer();
  judulMateri(w, "MATERI PEMBELAJARAN LENGKAP", data);

  w.tabelIdentitas([
    ["Nama Sekolah", ident.nama_sekolah],
    ["Mata Pelajaran", data.mata_pelajaran],
    ["Kelas", ident.kelas],
    ["Disusun oleh", ident.nama_guru],
  ]);
  w.p();

  if (str(data.pengantar)) {
    w.p(teks(data.pengantar), { align: "justify" });
    w.p();
  }

  objs(data.bagian).forEach((bagian, i) => {
    w.p(teks(bagian.judul || `Bagian ${i + 1}`), { bold: true, size: 12 });
    for (const par of arr(bagian.paragraf)) w.p(teks(par), { align: "justify" });
    for (const poin of arr(bagian.poin_penting)) w.butir(teks(poin));
    w.p();
  });

  const istilah = objs(data.istilah_penting);
  if (istilah.length) {
    w.p("ISTILAH PENTING", { bold: true, size: 12 });
    w.tabel(["Istilah", "Arti"], istilah.map((i) => [teks(i.istilah), teks(i.arti)]), [5.0, 12.0]);
    w.p();
  }

  const rangkuman = strs(data.rangkuman);
  if (rangkuman.length) {
    w.p("RANGKUMAN", { bold: true, size: 12 });
    for (const r of rangkuman) w.butir(r);
    w.p();
  }

  const sumber = strs(data.sumber_belajar);
  if (sumber.length) {
    w.p("SUMBER BELAJAR", { bold: true, size: 12 });
    for (const s of sumber) w.butir(s);
  }

  bagianLkpd(w, obj(data.lkpd), true);
  return w.toBuffer();
}

/** Simple bullet material for students; the LKPD has NO answer key (port of tulis_materi_siswa). */
export async function tulisMateriSiswa(data: Obj, ident: Ident): Promise<Buffer> {
  const w = new Writer();
  judulMateri(w, "MATERI PEMBELAJARAN UNTUK SISWA", data);

  w.tabelIdentitas([
    ["Nama Sekolah", ident.nama_sekolah],
    ["Mata Pelajaran", data.mata_pelajaran],
    ["Kelas", ident.kelas],
  ]);
  w.p();

  if (str(data.pengantar)) {
    w.p(teks(data.pengantar), { align: "justify" });
    w.p();
  }

  objs(data.bagian).forEach((bagian, i) => {
    w.p(teks(bagian.judul || `Bagian ${i + 1}`), { bold: true, size: 12 });
    for (const poin of arr(bagian.poin)) w.butir(teks(poin));
    w.p();
  });

  const istilah = objs(data.istilah_penting);
  if (istilah.length) {
    w.p("ISTILAH PENTING", { bold: true, size: 12 });
    for (const i of istilah) w.butirNama(teks(i.istilah), teks(i.arti));
    w.p();
  }

  const rangkuman = strs(data.rangkuman);
  if (rangkuman.length) {
    w.p("RANGKUMAN", { bold: true, size: 12 });
    for (const r of rangkuman) w.butir(r);
  }

  bagianLkpd(w, obj(data.lkpd), false);
  return w.toBuffer();
}
