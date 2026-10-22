import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Piano, School, Trophy, BookOpenCheck } from "lucide-react";
import { leaveClassroom } from "@/app/actions/classroom";
import { JoinClassForm } from "@/components/join-classroom-form";
import { DeleteButton } from "@/components/delete-button";
import { StudentMaterialCard } from "@/components/student-material-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState, Progress } from "@/components/ui/misc";
import { studentClassrooms, studentQuizzes, studentMaterials, studentProgress } from "@/lib/student-data";
import { requireStudent } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Student Home") };
}

export default async function StudentDashboard() {
  const t = await getT();
  const student = await requireStudent();
  const [classroom, material, quiz, progress] = await Promise.all([studentClassrooms(student.id), studentMaterials(student.id), studentQuizzes(student.id), studentProgress(student.id)]);
  const materialToday = material.filter((m) => m.today);
  const quizAvailable = quiz.filter((k) => k.bisaMencoba);

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[oklch(0.52_0.22_277)] to-[oklch(0.42_0.2_300)] p-6 text-white shadow-md sm:p-8">
        <p className="text-sm font-semibold opacity-80">{t("Happy learning,")}</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">{student.name.split(" ")[0]}</h1>
        <p className="mt-2 max-w-md text-sm opacity-90">
          {materialToday.length > 0
            ? t("There are {0} new lessons today. Let's learn!", materialToday.length)
            : quizAvailable.length > 0
              ? t("There are {0} quizzes waiting for you.", quizAvailable.length)
              : t("No new assignments. Let's practice piano first!")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="accent">
            <Link href="/student/practice/piano">
              <Piano /> {t("Play piano")}
            </Link>
          </Button>
        </div>
      </div>

      {classroom.length === 0 && (
        <Card className="mb-6 border-primary/40 bg-primary-soft/40">
          <CardHeader>
            <CardTitle>{t("Join your class")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">{t("Enter the class code from your teacher to see lessons and quizzes.")}</p>
            <JoinClassForm />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <BookOpenCheck className="size-5 text-primary" /> {t("Today's Lessons")}
            </h2>
            {materialToday.length === 0 ? (
              <EmptyState title={t("No new lessons today")} action={material.length ? <Button asChild variant="secondary"><Link href="/student/materials">{t("View all lessons")}</Link></Button> : undefined}>
                {classroom.length ? t("Check again tomorrow, or review earlier lessons.") : t("Join a class first to see lessons.")}
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {materialToday.map((m) => (
                  <StudentMaterialCard key={m.id} m={m} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <ClipboardList className="size-5 text-primary" /> {t("Quizzes for you")}
              </h2>
              <Link href="/student/quizzes" className="text-sm font-semibold text-primary hover:underline">
                {t("All quizzes")}
              </Link>
            </div>
            {quizAvailable.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("There are no quizzes to take.")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {quizAvailable.slice(0, 3).map((k) => (
                  <Link key={k.id} href={`/student/quizzes/${k.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-xs transition hover:border-primary hover:shadow-md">
                    <div className="min-w-0">
                      <p className="break-words font-bold">{k.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {k.questionCount} {t("questions")}{k.durationMinutes ? t(" · {0} minutes", k.durationMinutes) : ""}
                      </p>
                    </div>
                    <Badge tone={k.attemptInProgressId ? "warning" : "primary"} className="shrink-0">{k.attemptInProgressId ? t("Continue") : k.attemptCompleted ? t("Try again") : t("Start")}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-4.5 text-accent" /> {t("My Learning Progress")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              <div>
                <div className="mb-1.5 flex items-end justify-between">
                  <span className="text-sm text-muted-foreground">{t("Lessons completed")}</span>
                  <span className="text-2xl font-extrabold">{progress.percent}%</span>
                </div>
                <Progress value={progress.percent} label={t("Lessons completed")} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {progress.materialCompleted} {t("of")} {progress.materialTotal} {t("lessons")}
                </p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">{t("Latest quiz score")}</p>
                {progress.lastScore ? (
                  <>
                    <p className="text-3xl font-extrabold text-primary">{Math.round(progress.lastScore.grade)}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {progress.lastScore.title} · {formatDateTime(progress.lastScore.time)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-semibold">{t("No quizzes taken yet")}</p>
                )}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/student/grades">{t("View grade history")}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <School className="size-4.5 text-primary" /> {t("My classes")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3">
              {classroom.map((k) => (
                <div key={k.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{k.name}</p>
                    <p className="text-xs text-muted-foreground">{t("Teacher:")} {k.teacher}</p>
                  </div>
                  <DeleteButton action={leaveClassroom} id={k.id} label={t("Leave class")} confirmText={t("Leave this class?")} />
                </div>
              ))}
              {classroom.length > 0 && (
                <details className="rounded-lg border p-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-primary">{t("Join another class")}</summary>
                  <div className="mt-3">
                    <JoinClassForm />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
