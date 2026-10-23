import type { Metadata } from "next";
import { Metronome } from "@/components/metronome";
import { PianoModes } from "@/components/piano-modes";
import { PageHeader } from "@/components/ui/misc";
import { BackPractice } from "@/components/back-practice";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStudent } from "@/lib/session";
import { SONGS, songFromRow, type Song } from "@/lib/songs";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Virtual Piano") };
}

export default async function PianoPage() {
  const t = await getT();
  const student = await requireStudent();
  const S = schema;
  // Songs the teacher showed to one of this student's classes, then the built-in ones.
  const rows = await db
    .selectDistinct({ id: S.pianoSong.id, title: S.pianoSong.title, origin: S.pianoSong.origin, level: S.pianoSong.level, bpm: S.pianoSong.bpm, format: S.pianoSong.format, doNote: S.pianoSong.doNote, notation: S.pianoSong.notation, updatedAt: S.pianoSong.updatedAt })
    .from(S.classroomPianoSong)
    .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.classroomPianoSong.classroomId))
    .innerJoin(S.pianoSong, eq(S.pianoSong.id, S.classroomPianoSong.songId))
    .where(eq(S.classroomMembership.studentId, student.id))
    .orderBy(S.pianoSong.title);
  const songs: Song[] = [...rows.map(songFromRow).filter((s): s is Song => s !== null), ...SONGS];
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Virtual Piano")} description={t("Play a song with falling notes, or play freely. Slide your finger across the keys for a glissando.")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
          <PianoModes songs={songs} />
        </div>
        <Metronome />
      </div>
    </>
  );
}
