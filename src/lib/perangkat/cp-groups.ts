/** TP lists of the saved CP-TP-ATP documents, grouped per document (used by the Modul Ajar and Exam pickers). */
import { daftarTp, infoTp, konteksDariCp, nomorSemester, nomorTpUrut } from "./generator";
import { docContext } from "./store";
import type { CpGroup } from "./view";

type CpRow = { id: string; title: string; data: unknown; context: unknown };

export function buildCpGroups(cps: CpRow[]): CpGroup[] {
  const KONTEKS_CP_KEYS = ["mata_pelajaran", "kelas", "fase", "tahun_ajaran", "jumlah_tp"] as const;
  return cps
    .map((c) => {
      const info = infoTp(c.data);
      const derived = konteksDariCp(c.data);
      const persisted = docContext(c);
      // A hand-corrected tag (e.g. via the "Kelas" badge, after a wrong AI reading) must win over what's
      // freshly re-derived from the raw document on every load.
      const context = Object.fromEntries(KONTEKS_CP_KEYS.map((k) => [k, persisted[k] || derived[k]]).filter(([, v]) => v)) as Record<string, string>;
      return {
        cpId: c.id,
        cpTitle: c.title,
        context,
        // Ordered by semester, then BAB number, then TP number (the CP lists TP per element, so their raw order is scrambled).
        tps: daftarTp(c.data)
          .map((tp) => ({ tp, semester: info[tp]?.semester ?? "", babNomor: info[tp]?.bab_nomor ?? "", babJudul: info[tp]?.bab_judul ?? "", alokasi: info[tp]?.alokasi ?? "" }))
          .sort(
            (a, b) =>
              (nomorSemester(a.semester) ?? Infinity) - (nomorSemester(b.semester) ?? Infinity) ||
              (a.babNomor ? Number(a.babNomor) : Infinity) - (b.babNomor ? Number(b.babNomor) : Infinity) ||
              nomorTpUrut(a.tp) - nomorTpUrut(b.tp),
          ),
      };
    })
    .filter((g) => g.tps.length > 0);
}
