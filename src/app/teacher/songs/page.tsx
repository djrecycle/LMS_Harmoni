import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Pencil, Piano, Plus } from "lucide-react";
import { deletePianoSong } from "@/app/actions/piano-song";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/session";
import { songFromRow } from "@/lib/songs";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Piano Songs") };
}
const S = schema;

export default async function PianoSongList({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { saved } = await searchParams;
  const list = await db.select().from(S.pianoSong).where(eq(S.pianoSong.teacherId, teacher.id)).orderBy(desc(S.pianoSong.updatedAt));
  const ids = list.map((s) => s.id);
  const classes = ids.length
    ? await db
        .select({ songId: S.classroomPianoSong.songId, classroomId: S.classroom.id, name: S.classroom.name })
        .from(S.classroomPianoSong)
        .innerJoin(S.classroom, eq(S.classroom.id, S.classroomPianoSong.classroomId))
        .where(inArray(S.classroomPianoSong.songId, ids))
        .orderBy(S.classroom.name)
    : [];

  const newButton = (
    <Button asChild>
      <Link href="/teacher/songs/new">
        <Plus /> {t("New song")}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title={t("Piano Songs")} description={t("Songs for the falling-notes mode in your students' Virtual Piano. Write them yourself, or create them with AI from a prompt, a photo of sheet music, or a MIDI file.")} action={newButton} />
      {saved && (
        <Alert kind="success" className="mb-4">
          {t("Song saved.")}
        </Alert>
      )}
      {list.length === 0 ? (
        <EmptyState icon={<Piano />} title={t("No songs yet")} action={newButton}>
          {t("Students already have the built-in songs. Add your own songs, such as regional songs from your area, and choose which classes can see them.")}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {list.map((s) => {
            const song = songFromRow(s);
            const tg = classes.filter((c) => c.songId === s.id);
            return (
              <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
                <div className="flex min-w-0 flex-[1_1_16rem] gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Piano className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <Link href={`/teacher/songs/${s.id}`} className="break-words font-bold hover:text-primary hover:underline">
                      {s.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {"★".repeat(Math.min(3, Math.max(1, s.level)))}
                      {s.origin ? ` · ${s.origin}` : ""} · {s.bpm} BPM{song ? ` · ${t("{0} notes", song.notes.length)}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {!song && <Badge tone="danger">{t("Melody has an error")}</Badge>}
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
                    <Link href={`/teacher/songs/${s.id}`}>
                      <Pencil /> {t("Edit")}
                    </Link>
                  </Button>
                  <DeleteButton action={deletePianoSong} id={s.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
