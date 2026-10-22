import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ClipboardList, Eye } from "lucide-react";
import { MaterialForm } from "@/components/material-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { getOwnedMaterial } from "@/lib/access";
import { materialFormData } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit Lesson") };
}

export default async function EditMaterial({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const material = await getOwnedMaterial(teacher.id, id);
  if (!material) notFound();
  const [data, assignment] = await Promise.all([
    materialFormData(teacher.id),
    db.select({ classroomId: schema.classroomMaterial.classroomId, date: schema.classroomMaterial.date }).from(schema.classroomMaterial).where(eq(schema.classroomMaterial.materialId, material.id)),
  ]);
  return (
    <>
      <PageHeader
        title={t("Edit lesson")}
        description={material.title}
        action={
          <div className="flex flex-wrap gap-2">
            {material.typeMedia === "interactive" && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/teacher/materials/${material.id}/practice`}>
                  <ClipboardList /> {t("Practice recap")}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/materials/${material.id}/preview`} target="_blank">
                <Eye /> {t("Preview")}
              </Link>
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="pt-5">
          <MaterialForm {...data} material={material} initialAssignment={assignment} />
        </CardContent>
      </Card>
    </>
  );
}
