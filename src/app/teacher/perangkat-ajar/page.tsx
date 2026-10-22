import type { Metadata } from "next";
import { PerangkatWorkspace } from "@/components/perangkat-workspace";
import { PageHeader } from "@/components/ui/misc";
import { dailyLimit, providerOptions, remainingAllowance } from "@/lib/ai";
import { daftarTp, infoTp, konteksDariCp, nomorSemester, nomorTpUrut } from "@/lib/perangkat/generator";
import { docContext, expireStale, getSetting, listCpDocs, listDocs, listTemplates } from "@/lib/perangkat/store";
import type { CpGroup, LibraryRow } from "@/lib/perangkat/view";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Teaching Documents") };
}

export default async function PerangkatAjarPage() {
  const t = await getT();
  const teacher = await requireTeacher();
  await expireStale(teacher.id);

  const [setting, templates, docs, cps, { remaining }] = await Promise.all([
    getSetting(teacher.id),
    listTemplates(teacher.id),
    listDocs(teacher.id),
    listCpDocs(teacher.id),
    remainingAllowance(teacher.id),
  ]);

  const templateName = new Map(templates.map((x) => [x.id, x.nama]));
  const rows: LibraryRow[] = docs.map((d) => {
    const k = docContext(d);
    return {
      id: d.id,
      kind: d.kind,
      title: d.title,
      status: d.status,
      error: d.error,
      provider: d.provider,
      templateId: k.template_id ?? "bawaan",
      templateName: (k.template_id && templateName.get(k.template_id)) || k.template_nama || "",
      kelas: k.kelas ?? "",
      createdAt: d.createdAt.toISOString(),
    };
  });

  const KONTEKS_CP_KEYS = ["mata_pelajaran", "kelas", "fase", "tahun_ajaran", "jumlah_tp"] as const;
  const cpGroups: CpGroup[] = cps
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

  return (
    <>
      <PageHeader title={t("Teaching Documents")} description={t("The AI drafts your CP-TP-ATP, Modul Ajar, and teaching material with worksheets. Download them as Word files.")} />
      <PerangkatWorkspace
        setting={setting}
        templates={templates.map((x) => ({ id: x.id, name: x.nama }))}
        cpGroups={cpGroups}
        rows={rows}
        remaining={remaining}
        limit={await dailyLimit()}
        providers={await providerOptions()}
      />
    </>
  );
}
