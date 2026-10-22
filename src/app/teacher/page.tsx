import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, FileQuestionMark, Library, Trophy, Users, School, WandSparkles, Music, Mic, BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, EmptyState, PageHeader, Progress, StatCard } from "@/components/ui/misc";
import { LiveClassBanner } from "@/components/live/live-class-banner";
import { providerOptions } from "@/lib/ai";
import { todayLiveSchedules } from "@/lib/live-class";
import { recentActivity, studentsPendingQuiz, teacherQuizList, teacherSummary } from "@/lib/data";
import { requireTeacher } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Teacher Dashboard") };
}

const ACTIVITY_ICONS = { quiz: Trophy, material: BookOpenCheck, recording: Mic, practice: Music } as const;

export default async function TeacherDashboard() {
  const t = await getT();
  const teacher = await requireTeacher();
  const [short, newQuiz, activity, pending, aiProviders, live] = await Promise.all([
    teacherSummary(teacher.id),
    teacherQuizList(teacher.id, 5),
    recentActivity(teacher.id, 10),
    studentsPendingQuiz(teacher.id),
    teacher.isAdmin ? providerOptions() : Promise.resolve(null), // only the admin is told about AI setup
    todayLiveSchedules(teacher.id),
  ]);

  return (
    <>
      <PageHeader title={`Halo, ${teacher.name.split(" ").slice(0, 2).join(" ")}`} description={t("Summary of your classes and today's student learning activity.")} />

      <LiveClassBanner live={live.live} next={live.next} />

      {aiProviders && !aiProviders.some((p) => p.available) && (
        <Alert kind="warning" className="mb-6" title={t("No AI provider is set up yet")}>
          {t("The AI generators cannot be used until a provider is configured.")}{" "}
          <Link href="/teacher/admin/ai" className="font-semibold text-primary underline">
            {t("Open AI Settings")}
          </Link>
        </Alert>
      )}

      {/* Quick access*/}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/teacher/materials/new", label: t("Create lesson"), Icon: Library },
          { href: "/teacher/question-bank/new", label: t("Create question"), Icon: FileQuestionMark },
          { href: "/teacher/quizzes/new", label: t("Create quiz"), Icon: ClipboardList },
          { href: "/teacher/ai-generator", label: t("AI Generator"), Icon: WandSparkles },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-xl border bg-card p-3.5 text-sm font-bold shadow-xs transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-accent/25 text-accent-foreground dark:text-accent">
              <Icon className="size-4.5" />
            </span>
            {label}
          </Link>
        ))}
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("Classes")} value={short.classroom.length} icon={<School />} />
        <StatCard label={t("Number of students")} value={short.totalStudent} icon={<Users />} />
        <StatCard label={t("Average grade")} value={short.averageGrade ?? "–"} icon={<Trophy />} keterangan={t("from quizzes taken")} />
        <StatCard label={t("Active quizzes")} value={short.activeQuiz} icon={<ClipboardList />} />
      </div>

      {short.classroom.length === 0 ? (
        <EmptyState
          icon={<School />}
          title={t("Create your first class")}
          action={
            <Button asChild>
              <Link href="/teacher/classes/new">{t("Create class")}</Link>
            </Button>
          }
        >
          {t("After the class is created, share the invite code with your students. They can join right away and see your lessons.")}
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="grid content-start gap-6 lg:col-span-3">
            <section>
              <h2 className="mb-3 text-lg font-bold">{t("Class summary")}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {short.classroom.map((k) => (
                  <Link key={k.id} href={`/teacher/classes/${k.id}`} className="group rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold group-hover:text-primary">{k.name}</h3>
                      <Badge tone="primary">{k.stat.member.length} {t("students")}</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("Average grade")}</dt>
                        <dd className="text-lg font-extrabold">{k.stat.averageGrade ?? "–"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("Lesson progress")}</dt>
                        <dd className="text-lg font-extrabold">{k.stat.averageProgress}%</dd>
                      </div>
                    </dl>
                    <Progress value={k.stat.averageProgress} className="mt-2" label={t("Progress {0}", k.name)} />
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">{t("Latest quizzes")}</h2>
                <Link href="/teacher/quizzes" className="text-sm font-semibold text-primary hover:underline">
                  {t("All quizzes")}
                </Link>
              </div>
              {newQuiz.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("No quizzes yet.")}</p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {newQuiz.map((k) => (
                    <Link key={k.id} href={`/teacher/quizzes/${k.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3.5 shadow-xs transition hover:border-primary">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{k.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {k.classroomName} · {k.questionCount} {t("questions")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {!k.published && <Badge tone="warning">{t("Draft")}</Badge>}
                        <Badge tone="neutral">
                          {k.hasTaken}/{k.studentCount} {t("done")}
                        </Badge>
                        <span className="w-12 text-right font-extrabold">{k.averageGrade ?? "–"}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid content-start gap-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("Not started")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {pending.length === 0 && <p className="text-sm text-muted-foreground">{t("No published quizzes yet.")}</p>}
                {pending.map((b) => (
                  <div key={b.quizId}>
                    <p className="text-sm font-semibold">{b.title}</p>
                    {b.student.length === 0 ? (
                      <p className="text-sm text-success">{t("All students have taken it 🎉")}</p>
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {b.student.map((s) => (
                          <Badge key={s.id} tone="warning">
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Latest activity")}</CardTitle>
              </CardHeader>
              <CardContent>
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No student activity yet.")}</p>
                ) : (
                  <ul className="grid gap-3.5">
                    {activity.map((a, i) => {
                      const Icon = ACTIVITY_ICONS[a.kind];
                      return (
                        <li key={i} className="flex gap-3">
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0 text-sm">
                            <p>
                              <span className="font-semibold">{a.student}</span> {t(a.key, ...a.args)}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(a.time)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
