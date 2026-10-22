import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Eye, Headphones, Image as ImageIcon, Music, Pencil, Plus, Type, Video } from "lucide-react";
import { deletePracticeMaterial } from "@/app/actions/practice-material";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Practice Materials") };
}
const S = schema;
const ICON = { text: Type, image: ImageIcon, audio: Headphones, video: Video, interactive: Type } as const;

export default async function PracticeMaterialList({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { saved } = await searchParams;
  const list = await db.select().from(S.practiceMaterial).where(eq(S.practiceMaterial.teacherId, teacher.id)).orderBy(desc(S.practiceMaterial.updatedAt));
  const ids = list.map((m) => m.id);
  const classes = ids.length
    ? await db
        .select({ practiceMaterialId: S.classroomPracticeMaterial.practiceMaterialId, classroomId: S.classroom.id, name: S.classroom.name })
        .from(S.classroomPracticeMaterial)
        .innerJoin(S.classroom, eq(S.classroom.id, S.classroomPracticeMaterial.classroomId))
        .where(inArray(S.classroomPracticeMaterial.practiceMaterialId, ids))
        .orderBy(S.classroom.name)
    : [];

  const newButton = (
    <Button asChild>
      <Link href="/teacher/practice-materials/new">
        <Plus /> {t("New practice material")}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title={t("Practice Materials")} description={t("Extra songs, exercises and demo videos that show up on your students' Practice page.")} action={newButton} />
      {saved && (
        <Alert kind="success" className="mb-4">
          {t("Practice material saved.")}
        </Alert>
      )}
      {list.length === 0 ? (
        <EmptyState icon={<Music />} title={t("No practice materials yet")} action={newButton}>
          {t("Add a song, exercise sheet, audio or video for students to practice with, then choose which classes can see it.")}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {list.map((m) => {
            const Icon = ICON[m.typeMedia];
            const tg = classes.filter((c) => c.practiceMaterialId === m.id);
            return (
              <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
                <div className="flex min-w-0 flex-[1_1_16rem] gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <Link href={`/teacher/practice-materials/${m.id}`} className="break-words font-bold hover:text-primary hover:underline">
                      {m.title}
                    </Link>
                    {m.description && <p className="break-words text-sm text-muted-foreground">{m.description}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {tg.length === 0 ? (
                        <Badge tone="warning">{t("Not shown to any class")}</Badge>
                      ) : (
                        tg.map((c) => (
                          <Badge key={c.classroomId} tone="primary">
                            {c.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/practice-materials/${m.id}/preview`}>
                      <Eye /> {t("Preview")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/practice-materials/${m.id}`}>
                      <Pencil /> {t("Edit")}
                    </Link>
                  </Button>
                  <DeleteButton action={deletePracticeMaterial} id={m.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
