import type { Metadata } from "next";
import { PianoSongForm } from "@/components/piano-song-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { pianoSongFormData } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New song") };
}

export default async function NewPianoSong() {
  const t = await getT();
  const teacher = await requireTeacher();
  const data = await pianoSongFormData(teacher.id);
  return (
    <>
      <PageHeader title={t("New song")} />
      <Card>
        <CardContent className="pt-5">
          <PianoSongForm {...data} initialClassroomIds={[]} />
        </CardContent>
      </Card>
    </>
  );
}
