import type { Metadata } from "next";
import Link from "next/link";
import { Eye, FileSpreadsheet, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { removeStudent } from "@/app/actions/classroom";
import { enterStudentView } from "@/app/actions/student-view";
import { AddStudentForm } from "@/components/add-student-form";
import { DeleteButton } from "@/components/delete-button";
import { ClassForm } from "@/components/classroom-form";
import { CopyButton } from "@/components/copy-button";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { ShortUsernameButton } from "@/components/short-username-button";
import { ResetClassPasswordsButton } from "@/components/reset-class-passwords-button";
import { ResetInviteCodeButton } from "@/components/action-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader, Progress, StatCard } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { getOwnedClassroom } from "@/lib/access";
import { classStats } from "@/lib/data";
import { requireTeacher } from "@/lib/session";
import { formatDate, formatDateTime, today } from "@/lib/utils";
import { DeleteClassButton } from "@/components/action-buttons";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Class Details") };
}
const S = schema;

export default async function DetailClassroom({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const classroom = await getOwnedClassroom(teacher.id, id);
  if (!classroom) notFound();

  const [stat, material, quiz] = await Promise.all([
    classStats(classroom.id),
    db
      .select({
        id: S.material.id,
        title: S.material.title,
        date: S.classroomMaterial.date,
        type: S.material.typeMedia,
      })
      .from(S.classroomMaterial)
      .innerJoin(S.material, eq(S.material.id, S.classroomMaterial.materialId))
      .where(eq(S.classroomMaterial.classroomId, classroom.id))
      .orderBy(desc(S.classroomMaterial.date)),
    db
      .select()
      .from(S.quiz)
      .where(and(eq(S.quiz.classroomId, classroom.id), eq(S.quiz.teacherId, teacher.id)))
      .orderBy(desc(S.quiz.createdAt)),
  ]);
  const day = today();

  return (
    <>
      <PageHeader
        title={classroom.name}
        description={classroom.description ?? t("Manage the students, lessons, and quizzes of this class.")}
        action={
          <form action={enterStudentView.bind(null, classroom.id)}>
            <Button type="submit" variant="outline" title={t("Try the student pages of this class with a test student. It is not counted in grades or reports.")}>
              <Eye /> {t("View as student")}
            </Button>
          </form>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-gradient-to-br from-primary-soft to-card p-4 shadow-xs sm:col-span-1">
          <p className="text-xs font-semibold text-muted-foreground">{t("Class invite code")}</p>
          <p className="my-1 font-mono text-3xl font-extrabold tracking-[0.25em] text-primary">{classroom.inviteCode}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={classroom.inviteCode} label={t("Copy code")} />
            <ResetInviteCodeButton id={classroom.id} />
          </div>
        </div>
        <StatCard label={t("Average grade")} value={stat.averageGrade ?? "–"} keterangan={t("{0} quizzes published", stat.quizPublished.length)} />
        <StatCard label={t("Average lesson progress")} value={`${stat.averageProgress}%`} keterangan={t("{0} lessons published", stat.materialPublished)} />
      </div>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            {t("Students (")}
            {stat.member.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {stat.member.length > 0 && (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/roster/${classroom.id}?format=xlsx`} download>
                    <FileSpreadsheet /> {t("Download Excel")}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/roster/${classroom.id}?format=pdf`} download>
                    <FileText /> {t("Download PDF")}
                  </a>
                </Button>
              </>
            )}
            {stat.member.some((s) => s.username) && <ShortUsernameButton classroomId={classroom.id} className={classroom.name} />}
            {stat.member.some((s) => s.username) && (
              <ResetClassPasswordsButton
                classroomId={classroom.id}
                className={classroom.name}
                students={stat.member.flatMap((s) => (s.username ? [{ id: s.id, name: s.name, username: s.username }] : []))}
              />
            )}
            <AddStudentForm classroomId={classroom.id} />
          </div>
        </div>
        {stat.member.length === 0 ? (
          <EmptyState title={t("No students yet")}>{t("Share the invite code above, or add a student by hand. Students enter the code on their Home page.")}</EmptyState>
        ) : (
          <>
            {/* Phones: one card per student (the six-column table only fits from md up). */}
            <ul className="grid gap-2.5 md:hidden">
              {stat.member.map((s) => (
                <li key={s.id} className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs">
                  {/* Name gets the full card width (a grade column beside it squeezed long names); the grade sits in the info line. */}
                  <div className="min-w-0">
                    <Link href={`/teacher/classes/${classroom.id}/students/${s.id}`} className="font-semibold hover:text-primary hover:underline">
                      {s.name}
                    </Link>
                    <p className="text-xs break-all text-muted-foreground">
                      {s.username ? (
                        <>
                          {t("Username:")} <span className="font-mono">{s.username}</span>
                        </>
                      ) : (
                        s.email
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={s.progress} className="flex-1" label={t("Progress {0}", s.name)} />
                    <span className="text-xs font-semibold">{s.progress}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("Quizzes")}: <b className="text-foreground">{`${s.quizCompleted}/${stat.quizPublished.length}`}</b> · {t("Average grade")}:{" "}
                    <b className="text-foreground">{s.averageGrade ?? "–"}</b> · {s.activeLast ? formatDateTime(s.activeLast) : t("Not active yet")}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 border-t pt-2">
                    {s.username && <ResetPasswordButton studentId={s.id} />}
                    <DeleteButton action={removeStudent} id={`${classroom.id}:${s.id}`} label={t("Remove")} confirmText={t("Remove from class?")} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-xs md:block">
              <table className="w-full min-w-[42rem] text-sm">
                <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">{t("Name")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("Lesson progress")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("Quizzes")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("Average grade")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("Last active")}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stat.member.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/teacher/classes/${classroom.id}/students/${s.id}`} className="font-semibold hover:text-primary hover:underline">
                          {s.name}
                        </Link>
                        {s.username ? (
                          <p className="text-xs text-muted-foreground">
                            {t("Username:")} <span className="font-mono">{s.username}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{s.email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Progress value={s.progress} className="w-24" label={t("Progress {0}", s.name)} />
                          <span className="text-xs font-semibold">{s.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {s.quizCompleted}/{stat.quizPublished.length}
                      </td>
                      <td className="px-4 py-3 font-extrabold">{s.averageGrade ?? "–"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{s.activeLast ? formatDateTime(s.activeLast) : t("Not active yet")}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {s.username && <ResetPasswordButton studentId={s.id} />}
                          <DeleteButton action={removeStudent} id={`${classroom.id}:${s.id}`} label={t("Remove")} confirmText={t("Remove from class?")} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("Class lessons")}</CardTitle>
            <Button asChild size="sm" variant="secondary">
              <Link href="/teacher/materials/new">{t("New lesson")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {material.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No lessons have been assigned to this class yet.")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {material.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/teacher/materials/${m.id}`} className="min-w-0 break-words font-semibold hover:text-primary hover:underline">
                      {m.title}
                    </Link>
                    <Badge tone={m.date === day ? "success" : m.date > day ? "warning" : "neutral"} className="shrink-0">
                      {m.date === day ? t("Today") : m.date > day ? t("Published {0}", formatDate(m.date)) : formatDate(m.date)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("Class quizzes")}</CardTitle>
            <Button asChild size="sm" variant="secondary">
              <Link href="/teacher/quizzes/new">{t("New quiz")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {quiz.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("There are no quizzes for this class yet.")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {quiz.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/teacher/quizzes/${k.id}`} className="min-w-0 break-words font-semibold hover:text-primary hover:underline">
                      {k.title}
                    </Link>
                    <Badge tone={k.published ? "success" : "warning"} className="shrink-0">{k.published ? t("Published") : t("Draft")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{t("Class settings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassForm classroom={classroom} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger-soft/50 p-4">
        <div>
          <p className="font-bold">{t("Delete class")}</p>
          <p className="text-sm text-muted-foreground">{t("All quizzes of this class and their results are deleted too. This cannot be undone.")}</p>
        </div>
        <DeleteClassButton id={classroom.id} />
      </div>
    </>
  );
}
