import type { Metadata } from "next";
import { ClassForm } from "@/components/classroom-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New Class") };
}

export default async function NewClassroom() {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("New class")} description={t("The invite code is generated automatically after the class is saved.")} />
      <Card className="max-w-xl">
        <CardContent className="pt-5">
          <ClassForm />
        </CardContent>
      </Card>
    </>
  );
}
