import type { Metadata } from "next";
import { MaterialForm } from "@/components/material-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { materialFormData } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New Lesson") };
}

export default async function NewMaterial() {
  const t = await getT();
  const teacher = await requireTeacher();
  const data = await materialFormData(teacher.id);
  return (
    <>
      <PageHeader title={t("New lesson")} />
      <Card>
        <CardContent className="pt-5">
          <MaterialForm {...data} initialAssignment={[]} />
        </CardContent>
      </Card>
    </>
  );
}
