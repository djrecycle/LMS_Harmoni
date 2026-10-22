import { obj, objs, str, type Obj } from "../util";
import { Writer, teks, type Ident } from "./base";

/** CP – TP – ATP document (port of tulis_cp_tp_atp). */
export async function tulisCpTpAtp(data: Obj, ident: Ident): Promise<Buffer> {
  const w = new Writer();

  w.p("CP – TP – ATP", { bold: true, size: 14, align: "center" });
  w.p(teks(data.mata_pelajaran).toUpperCase(), { bold: true, size: 13, align: "center" });

  const identitas = obj(data.identitas);
  w.tabelIdentitas([
    ["SATUAN PENDIDIKAN", str(identitas.satuan_pendidikan) || ident.nama_sekolah],
    ["KELAS / SEMESTER", identitas.kelas_semester],
    ["FASE / TAHUN AJARAN", identitas.fase_tahun_ajaran],
  ]);
  w.p();

  w.p("A. CAPAIAN PEMBELAJARAN DAN TUJUAN PEMBELAJARAN", { bold: true, size: 12 });
  const baris = objs(data.cp_tp).map((item, i) => [
    `${teks(item.no || i + 1)}.`,
    teks(item.elemen),
    teks(item.subelemen),
    teks(item.capaian_pembelajaran),
    teks(item.materi),
    teks(item.tujuan_pembelajaran),
  ]);
  w.tabel(["NO.", "ELEMEN", "SUBELEMEN /\nFOKUS KOMPETENSI", "CAPAIAN\nPEMBELAJARAN", "MATERI", "TUJUAN PEMBELAJARAN"], baris, [1.0, 2.6, 3.0, 4.2, 3.6, 4.4]);
  w.p();

  const kelas = teks(ident.kelas);
  w.p(`B. ALUR TUJUAN PEMBELAJARAN (ATP) KELAS ${kelas}`.trim(), { bold: true, size: 12 });
  if (str(data.catatan_atp)) w.p(teks(data.catatan_atp), { align: "justify" });

  for (const semester of objs(data.atp)) {
    w.p(teks(semester.semester).toUpperCase(), { bold: true, size: 12 });
    if (str(semester.keterangan)) w.p(teks(semester.keterangan));
    for (const unit of objs(semester.unit)) {
      w.p(teks(unit.nama).toUpperCase(), { bold: true });
      w.tabel(
        ["URUTAN", "TUJUAN PEMBELAJARAN", "ALOKASI"],
        objs(unit.baris).map((b) => [teks(b.urutan), teks(b.tujuan), teks(b.alokasi)]),
        [2.0, 12.0, 2.5],
      );
      w.p();
    }
    if (str(semester.total)) w.p(teks(semester.total), { bold: true });
  }

  w.p(`C. REKAPITULASI ATP KELAS ${kelas}`.trim(), { bold: true, size: 12 });
  w.tabel(
    ["SEMESTER", "JUMLAH TP", "MINGGU EFEKTIF", "ALOKASI WAKTU"],
    objs(data.rekapitulasi).map((r) => [teks(r.semester), teks(r.jumlah_tp), teks(r.minggu), teks(r.alokasi)]),
    [4.5, 4.5, 4.0, 4.0],
  );

  w.blokTtd(ident, "Guru Mata pelajaran");
  return w.toBuffer();
}
