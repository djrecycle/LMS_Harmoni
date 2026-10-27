import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpDown, Drum, Layers, ListMusic, Mic, Music, Piano } from "lucide-react";
import { PracticeMaterialCard } from "@/components/practice-material-view";
import { Badge, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { PRACTICE_KIND_LABEL } from "@/lib/practice";
import { isRhythmOnly, rhythmBlocksOf } from "@/lib/rhythm-materials";
import { requireStudent } from "@/lib/session";
import { studentPracticeMaterials } from "@/lib/student-data";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Practice") };
}

const MENU = [
  { href: "/student/practice/piano", title: "Virtual Piano", content: "Play freely on the screen, a computer keyboard, or a MIDI keyboard. Includes a metronome.", Icon: Piano, tone: "from-violet-500 to-indigo-600" },
  { href: "/student/practice/pitch", title: "Pitch Practice", content: "Listen to a short melody, then repeat it on the piano.", Icon: Music, tone: "from-sky-500 to-blue-600" },
  { href: "/student/practice/rhythm", title: "Rhythm Practice", content: "Tap rhythm patterns to the tempo. Your accuracy is scored.", Icon: Drum, tone: "from-amber-500 to-orange-600" },
  { href: "/student/practice/intervals", title: "Intervals", content: "Listen to two notes and name the distance between them.", Icon: ArrowUpDown, tone: "from-emerald-500 to-teal-600" },
  { href: "/student/practice/chords", title: "Chords", content: "Hear a chord and tell if it is major, minor, diminished or augmented.", Icon: Layers, tone: "from-fuchsia-500 to-purple-600" },
  { href: "/student/practice/scales", title: "Scales", content: "Hear a scale and name its type, such as major or minor.", Icon: ListMusic, tone: "from-cyan-500 to-sky-600" },
  { href: "/student/practice/recordings", title: "Record & Play Back", content: "Record your playing, listen again, and save it for your teacher.", Icon: Mic, tone: "from-rose-500 to-pink-600" },
];

export default async function PracticeHub() {
  const t = await getT();
  const student = await requireStudent();
  const S = schema;
  const [latest, allMaterials] = await Promise.all([
    db.select().from(S.practiceResult).where(eq(S.practiceResult.studentId, student.id)).orderBy(desc(S.practiceResult.createdAt)).limit(6),
    studentPracticeMaterials(student.id),
  ]);
  // Rhythm-only materials are practised in Rhythm Practice, not listed here as separate cards.
  const materials = allMaterials.filter((m) => !isRhythmOnly(m));
  const teacherRhythms = allMaterials.reduce((n, m) => n + rhythmBlocksOf(m.content).length, 0);
  return (
    <>
      <PageHeader title={t("Instrument Practice")} description={t("Practice any time. The more you play, the smoother you get!")} />
      <div className="grid gap-4 sm:grid-cols-2">
        {MENU.map(({ href, title, content, Icon, tone }) => (
          <Link key={href} href={href} className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md">
            <span className={`grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-sm transition-transform group-hover:rotate-3`}>
              <Icon className="size-8" />
            </span>
            <div>
              <h2 className="text-lg font-bold">{t(title)}</h2>
              <p className="text-sm text-muted-foreground">{t(content)}</p>
              {href === "/student/practice/rhythm" && teacherRhythms > 0 && (
                <Badge tone="primary" className="mt-1.5">
                  {t("{0} patterns from your teacher", teacherRhythms)}
                </Badge>
              )}
            </div>
          </Link>
        ))}
      </div>
      {materials.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{t("Practice materials from your teacher")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {materials.map((m) => (
              <PracticeMaterialCard key={m.id} material={m} href={`/student/practice/materials/${m.id}`} />
            ))}
          </div>
        </section>
      )}
      {latest.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{t("Your latest practice")}</h2>
          <div className="grid grid-cols-1 gap-2">
            {latest.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-xs">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{h.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="primary">{t(PRACTICE_KIND_LABEL[h.kind])}</Badge>
                  <span className="w-10 text-right text-xl font-extrabold">{h.score}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
