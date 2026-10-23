import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PianoSongForm } from "@/components/piano-song-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { getOwnedPianoSong } from "@/lib/access";
import { pianoSongFormData } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit song") };
}

export default async function EditPianoSong({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const song = await getOwnedPianoSong(teacher.id, id);
  if (!song) notFound();
  const [data, assigned] = await Promise.all([
    pianoSongFormData(teacher.id),
    db.select({ classroomId: schema.classroomPianoSong.classroomId }).from(schema.classroomPianoSong).where(eq(schema.classroomPianoSong.songId, song.id)),
  ]);
  const { id: songId, title, origin, level, bpm, format, doNote, notation } = song;
  return (
    <>
      <PageHeader title={t("Edit song")} description={song.title} />
      <Card>
        <CardContent className="pt-5">
          <PianoSongForm song={{ id: songId, title, origin, level, bpm, format, doNote, notation }} {...data} initialClassroomIds={assigned.map((a) => a.classroomId)} />
        </CardContent>
      </Card>
    </>
  );
}
