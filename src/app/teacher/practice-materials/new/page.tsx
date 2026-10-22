import type { Metadata } from "next";
import { PracticeMaterialForm } from "@/components/practice-material-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { practiceMaterialFormData } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New practice material") };
}

export default async function NewPracticeMaterial() {
  const t = await getT();
  const teacher = await requireTeacher();
  const data = await practiceMaterialFormData(teacher.id);
  return (
    <>
      <PageHeader title={t("New practice material")} />
      <Card>
        <CardContent className="pt-5">
          <PracticeMaterialForm {...data} initialClassroomIds={[]} />
        </CardContent>
      </Card>
    </>
  );
}
