import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ClipboardList, Download, Eye, Headphones, Image as ImageIcon, Library, NotebookText, Pencil, Plus, Sparkles, Type, Video } from "lucide-react";
import { deleteMaterial, setMaterialKelas } from "@/app/actions/material";
import { DeleteButton } from "@/components/delete-button";
import { KelasBadge } from "@/components/kelas-badge";
import { MaterialsFromPerangkat, type PerangkatMaterialRow } from "@/components/materials-from-perangkat";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { docContext } from "@/lib/perangkat/store";
import { requireTeacher } from "@/lib/session";
import { formatDate, today } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Lessons") };
}
const S = schema;
const ICON = { text: Type, image: ImageIcon, audio: Headphones, video: Video, interactive: Sparkles } as const;

/** Where a lesson's file lives: our own storage (forced download) or an external link (opened, not downloaded). Interactive lessons have nothing to download. */
function downloadLink(m: { id: string; title: string; typeMedia: keyof typeof ICON; mediaKey: string | null }): { href: string; external: boolean } | null {
  if (m.typeMedia === "text") return { href: `/api/materials/${m.id}/download`, external: false };
  if (m.typeMedia === "interactive") return null;
  if (!m.mediaKey) return null;
  if (/^https?:\/\//i.test(m.mediaKey)) return { href: m.mediaKey, external: true };
  const ext = m.mediaKey.split(".").pop();
  const name = encodeURIComponent(`${m.title.trim() || "materi"}${ext ? `.${ext}` : ""}`);
  return { href: `/api/files/${m.mediaKey}?dl=${name}`, external: false };
}

export default async function MaterialList({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { saved } = await searchParams;
  const list = await db.select().from(S.material).where(eq(S.material.teacherId, teacher.id)).orderBy(desc(S.material.updatedAt));
  const ids = list.map((m) => m.id);

  const assignment = ids.length
    ? await db
        .select({ materialId: S.classroomMaterial.materialId, classroomId: S.classroom.id, classroom: S.classroom.name, date: S.classroomMaterial.date })
        .from(S.classroomMaterial)
        .innerJoin(S.classroom, eq(S.classroom.id, S.classroomMaterial.classroomId))
        .where(inArray(S.classroomMaterial.materialId, ids))
        .orderBy(S.classroomMaterial.date)
    : [];
  const completed = ids.length
    ? await db
        .select({ materialId: S.materialProgress.materialId })
        .from(S.materialProgress)
        .innerJoin(S.user, eq(S.user.id, S.materialProgress.studentId))
        .where(and(inArray(S.materialProgress.materialId, ids), isNull(S.user.demoOwnerId))) // not the teacher's test student
    : [];
  const day = today();

  const perangkatDocs = await db
    .select({ id: S.teachingDoc.id, kind: S.teachingDoc.kind, title: S.teachingDoc.title, provider: S.teachingDoc.provider, context: S.teachingDoc.context, createdAt: S.teachingDoc.createdAt })
    .from(S.teachingDoc)
    .where(and(eq(S.teachingDoc.teacherId, teacher.id), inArray(S.teachingDoc.kind, ["materi_guru", "materi_siswa"]), eq(S.teachingDoc.status, "done")))
    .orderBy(desc(S.teachingDoc.createdAt));
  const perangkatRows: PerangkatMaterialRow[] = perangkatDocs.map((d) => ({
    id: d.id,
    kind: d.kind as "materi_guru" | "materi_siswa",
    title: d.title,
    provider: d.provider,
    kelas: docContext(d).kelas ?? "",
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title={t("Lessons")}
        description={t("Build multimedia lessons and assign them to classes.")}
        action={
          <>
            <Button asChild variant="outline">
              <Link href="/teacher/materials/new-summary">
                <NotebookText /> {t("Short Lesson / Summary")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/teacher/materials/new">
                <Plus /> {t("New lesson")}
              </Link>
            </Button>
          </>
        }
      />
      {saved && (
        <Alert kind="success" className="mb-4">
          {t("Lesson saved successfully.")}
        </Alert>
      )}
      <MaterialsFromPerangkat rows={perangkatRows} />
      {list.length === 0 ? (
        <EmptyState icon={<Library />} title={t("No lessons yet")} action={<Button asChild><Link href="/teacher/materials/new">{t("Create your first lesson")}</Link></Button>}>
          {t("Write a lesson with text, images, audio, or video, then assign it to a class.")}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {list.map((m) => {
            const Icon = ICON[m.typeMedia];
            const tg = assignment.filter((x) => x.materialId === m.id);
            const countCompleted = completed.filter((s) => s.materialId === m.id).length;
            const dl = downloadLink(m);
            return (
              <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
                {/* Basis 16rem: on a phone the action buttons wrap under the title instead of squeezing it. */}
                <div className="flex min-w-0 flex-[1_1_16rem] gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <Link href={`/teacher/materials/${m.id}`} className="font-bold hover:text-primary hover:underline">
                      {m.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <KelasBadge id={m.id} value={m.kelas ?? ""} action={setMaterialKelas} />
                      {m.topic && <Badge tone="neutral">{m.topic}</Badge>}
                      {tg.length === 0 ? (
                        <Badge tone="warning">{t("Not assigned")}</Badge>
                      ) : (
                        tg.map((x) => (
                          <Badge key={x.classroomId} tone={x.date > day ? "warning" : "primary"}>
                            {x.classroom} · {x.date === day ? t("today") : formatDate(x.date)}
                          </Badge>
                        ))
                      )}
                      {countCompleted > 0 && <Badge tone="success">{countCompleted} {t("students done")}</Badge>}
                    </div>
                  </div>
                </div>
                {/* Wraps: download · preview · edit · delete in one row is wider than a phone screen. */}
                <div className="flex flex-wrap items-center gap-2">
                  {dl && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <a href={dl.href} download={dl.external ? undefined : true} target={dl.external ? "_blank" : undefined} rel={dl.external ? "noopener noreferrer" : undefined}>
                          <Download /> {dl.external ? t("Open") : m.typeMedia === "text" ? t("Download PDF") : t("Download")}
                        </a>
                      </Button>
                      {m.typeMedia === "text" && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                          <a href={`/api/materials/${m.id}/download?format=docx`} download className="hover:text-primary hover:underline">
                            DOCX
                          </a>
                          ·
                          <a href={`/api/materials/${m.id}/download?format=md`} download className="hover:text-primary hover:underline">
                            MD
                          </a>
                        </span>
                      )}
                    </div>
                  )}
                  {m.typeMedia === "interactive" && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/teacher/materials/${m.id}/practice`}>
                        <ClipboardList /> {t("Practice recap")}
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/materials/${m.id}/preview`}>
                      <Eye /> {t("Preview")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/materials/${m.id}`}>
                      <Pencil /> {t("Edit")}
                    </Link>
                  </Button>
                  <DeleteButton action={deleteMaterial} id={m.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
