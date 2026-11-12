import type { Metadata } from "next";
import { ExamSetupForm } from "@/components/exam-setup-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { DEFAULT_COMPOSITION } from "@/lib/exam";
import { buildCpGroups } from "@/lib/perangkat/cp-groups";
import { getSetting, listCpDocs } from "@/lib/perangkat/store";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New exam") };
}

export default async function NewExam() {
  const t = await getT();
  const teacher = await requireTeacher();
  const [setting, cps] = await Promise.all([getSetting(teacher.id), listCpDocs(teacher.id)]);
  const info = {
    mata_pelajaran: setting.mata_pelajaran,
    kelas: setting.kelas,
    fase: setting.fase,
    semester: setting.semester,
    tahun_ajaran: setting.tahun_ajaran,
    nama_sekolah: setting.nama_sekolah,
    nama_guru: setting.nama_guru,
    jenis_ujian: "PSAT",
  };
  return (
    <>
      <PageHeader title={t("New exam")} description={t("Set the identity, choose the TP to test, and plan the number of questions and weights. The blueprint and questions come next.")} />
      <Card>
        <CardContent className="pt-5">
          <ExamSetupForm initial={{ title: "", info, tps: [], composition: DEFAULT_COMPOSITION }} cpGroups={buildCpGroups(cps)} />
        </CardContent>
      </Card>
    </>
  );
}
