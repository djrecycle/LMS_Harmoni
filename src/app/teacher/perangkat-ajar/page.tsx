import type { Metadata } from "next";
import { PerangkatWorkspace } from "@/components/perangkat-workspace";
import { PageHeader } from "@/components/ui/misc";
import { dailyLimit, providerOptions, remainingAllowance } from "@/lib/ai";
import { buildCpGroups } from "@/lib/perangkat/cp-groups";
import { docContext, expireStale, getSetting, listCpDocs, listDocs, listTemplates } from "@/lib/perangkat/store";
import type { LibraryRow } from "@/lib/perangkat/view";
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
      lessonCount: k.lesson_ids?.length ?? 0,
      lessonError: k.lesson_error ?? "",
      createdAt: d.createdAt.toISOString(),
    };
  });

  const cpGroups = buildCpGroups(cps);

  return (
    <>
      <PageHeader title={t("Teaching Documents")} description={t("The AI drafts your CP-TP-ATP, Modul Ajar, and teaching material with worksheets. Download them as Word files.")} />
      <PerangkatWorkspace
        setting={setting}
        templates={templates.map((x) => ({ id: x.id, name: x.nama }))}
        cpGroups={cpGroups}
        rows={rows}
        remaining={remaining}
        limit={await dailyLimit(teacher.id)}
        providers={await providerOptions(teacher.id)}
      />
    </>
  );
}
