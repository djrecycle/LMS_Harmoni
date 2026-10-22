import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CircleCheck, Eye, EyeOff, Library, Users, Wifi } from "lucide-react";
import { AutoRefresh } from "@/components/live/auto-refresh";
import { ShareMaterialForm } from "@/components/live/share-material-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, EmptyState, Progress, StatCard } from "@/components/ui/misc";
import { liveClassData, type LiveCell } from "@/lib/live-class";
import { requireTeacher } from "@/lib/session";
import { cn, formatDateTime, today } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Live Class") };
}

const fmtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });
const sameDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(d) === today();
/** "07:42" for today, the full date-time otherwise. */
const when = (d: Date) => (sameDay(d) ? fmtTime.format(d) : formatDateTime(d));

type Status = "completed" | "opened" | "none";
const statusOf = (c: LiveCell): Status => (c.completed ? "completed" : c.openedAt ? "opened" : "none");

export default async function LiveClassPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const data = await liveClassData(teacher.id, id);
  if (!data) notFound();
  const { schedule, classroom, materials, shareable, students } = data;
  const online = students.filter((s) => s.online).length;

  return (
    <>
      <Link href="/teacher" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Dashboard")}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {schedule.ongoing ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-0.5 text-xs font-bold tracking-wide text-white">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-white" />
                </span>
                LIVE
              </span>
            ) : (
              <Badge tone="neutral">{t("Not in session")}</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {schedule.mataPelajaran} · {schedule.jamMulai}–{schedule.jamSelesai}
            </span>
          </div>
          <h1 className="break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{classroom.name}</h1>
        </div>
        <AutoRefresh />
      </div>

      {!schedule.ongoing && (
        <Alert kind="info" className="mb-6" title={t("This class is not in session right now")}>
          {t("The data below still updates, but the class's scheduled time has not started or has already ended.")}
        </Alert>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Online now")} value={`${online}/${students.length}`} icon={<Wifi />} />
        <StatCard label={t("Lessons tracked")} value={materials.length} icon={<Library />} keterangan={materials.some((m) => m.today) ? t("shared today") : t("latest shared")} />
        <StatCard
          label={t("Opened every lesson")}
          value={`${students.filter((s) => materials.length > 0 && materials.every((m) => s.cells[m.id]?.openedAt)).length}/${students.length}`}
          icon={<Eye />}
        />
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Users />} title={t("No students in this class yet")}>
          {t("Add students or share the invite code from the class page.")}
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Who is online */}
          <Card className="content-start lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("Students")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2">
                {students.map((s) => (
                  <li key={s.id} className={cn("flex items-start gap-3 rounded-lg border p-2.5", s.online ? "border-success/40 bg-success-soft/40" : "bg-card")}>
                    <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", s.online ? "bg-success shadow-[0_0_0_3px] shadow-success/25" : "bg-muted-foreground/40")} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.online
                          ? s.currentMaterialTitle
                            ? t("Online · opening “{0}”", s.currentMaterialTitle)
                            : t("Online")
                          : s.lastSeenAt
                            ? t("Offline · last active {0}", when(s.lastSeenAt))
                            : t("Not signed in yet")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Lesson progress */}
          <div className="grid content-start gap-4 lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>{t("Share a lesson now")}</CardTitle>
              </CardHeader>
              <CardContent>
                {shareable.length ? (
                  <ShareMaterialForm classroomId={classroom.id} options={shareable} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("No other lessons to share.")}{" "}
                    <Link href="/teacher/materials/new" className="font-semibold text-primary underline">
                      {t("Create lesson")}
                    </Link>
                  </p>
                )}
              </CardContent>
            </Card>

            {materials.length === 0 ? (
              <EmptyState icon={<BookOpen />} title={t("No lessons shared with this class yet")}>
                {t("Share a lesson above, then watch which students open it.")}
              </EmptyState>
            ) : (
              materials.map((m) => {
                const groups: Record<Status, typeof students> = { completed: [], opened: [], none: [] };
                for (const s of students) groups[statusOf(s.cells[m.id])].push(s);
                const opened = groups.completed.length + groups.opened.length;
                return (
                  <Card key={m.id}>
                    <CardContent className="grid gap-3 pt-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-bold">{m.title}</p>
                          <p className="text-xs text-muted-foreground">{m.today ? t("Shared today") : t("Shared {0}", m.date.split("-").reverse().join("/"))}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone="primary">
                            <Eye className="size-3" /> {opened}/{students.length}
                          </Badge>
                          <Badge tone="success">
                            <CircleCheck className="size-3" /> {groups.completed.length}
                          </Badge>
                        </div>
                      </div>
                      <Progress value={(opened / students.length) * 100} label={t("Opened {0}", m.title)} />

                      <StudentGroup title={t("Not opened yet")} icon={<EyeOff className="size-3.5" />} tone="warning" names={groups.none.map((s) => ({ id: s.id, name: s.name }))} />
                      <StudentGroup
                        title={t("Opened")}
                        icon={<Eye className="size-3.5" />}
                        tone="primary"
                        names={groups.opened.map((s) => ({ id: s.id, name: s.name, note: s.cells[m.id].openedAt ? when(s.cells[m.id].openedAt!) : undefined }))}
                      />
                      <StudentGroup
                        title={t("Completed")}
                        icon={<CircleCheck className="size-3.5" />}
                        tone="success"
                        names={groups.completed.map((s) => ({ id: s.id, name: s.name, note: s.cells[m.id].completedAt ? when(s.cells[m.id].completedAt!) : undefined }))}
                      />
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StudentGroup({
  title,
  icon,
  tone,
  names,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "warning" | "primary" | "success";
  names: { id: string; name: string; note?: string }[];
}) {
  if (names.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon} {title} ({names.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n) => (
          <Badge key={n.id} tone={tone} className="max-w-full break-words">
            {n.name}
            {n.note && <span className="font-normal opacity-75">· {n.note}</span>}
          </Badge>
        ))}
      </div>
    </div>
  );
}
