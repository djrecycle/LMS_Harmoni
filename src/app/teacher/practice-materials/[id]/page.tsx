import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { eq } from "drizzle-orm";
import { PracticeMaterialForm } from "@/components/practice-material-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { getOwnedPracticeMaterial } from "@/lib/access";
import { practiceMaterialFormData } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit practice material") };
}

export default async function EditPracticeMaterial({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const material = await getOwnedPracticeMaterial(teacher.id, id);
  if (!material) notFound();
  const [data, assigned] = await Promise.all([
    practiceMaterialFormData(teacher.id),
    db.select({ classroomId: schema.classroomPracticeMaterial.classroomId }).from(schema.classroomPracticeMaterial).where(eq(schema.classroomPracticeMaterial.practiceMaterialId, material.id)),
  ]);
  const typeMedia = material.typeMedia === "interactive" ? "text" : material.typeMedia;
  return (
    <>
      <PageHeader
        title={t("Edit practice material")}
        description={material.title}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/teacher/practice-materials/${material.id}/preview`} target="_blank">
              <Eye /> {t("Preview")}
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-5">
          <PracticeMaterialForm material={{ ...material, typeMedia }} {...data} initialClassroomIds={assigned.map((a) => a.classroomId)} />
        </CardContent>
      </Card>
    </>
  );
}
