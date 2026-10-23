import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Eye, Pencil } from "lucide-react";
import { DeleteQuizButton, PublishButton, ResetAttemptsButton } from "@/components/quiz-actions";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, StatCard } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { getOwnedQuiz } from "@/lib/access";
import { requireTeacher } from "@/lib/session";
import { round, formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { memberOf, membersOf } from "@/lib/members";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Quiz Details") };
}
const S = schema;

export default async function DetailQuiz({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const quiz = await getOwnedQuiz(teacher.id, id);
  if (!quiz) notFound();

  const [classroom] = await db.select().from(S.classroom).where(eq(S.classroom.id, quiz.classroomId));
  const [member, attempt, question] = await Promise.all([
    db
      .select({ id: S.user.id, name: S.user.name })
      .from(S.classroomMembership)
      .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
      .where(memberOf(quiz.classroomId))
      .orderBy(S.user.name),
    db.select().from(S.attempt).where(eq(S.attempt.quizId, quiz.id)),
    db.select({ id: S.quizQuestion.id }).from(S.quizQuestion).where(eq(S.quizQuestion.quizId, quiz.id)),
  ]);

  const row = member.map((a) => {
    const p = attempt.filter((x) => x.studentId === a.id);
    const completed = p.filter((x) => x.status === "completed");
    const best = completed.length ? completed.reduce((m, x) => (x.grade > m.grade ? x : m)) : null;
    return {
      ...a,
      inProgress: p.some((x) => x.status === "in_progress"),
      count: completed.length,
      best,
      pending: completed.reduce((s, x) => s + x.pendingReview, 0),
    };
  });
  const done = row.filter((b) => b.best);
  const average = done.length ? round(done.reduce((s, b) => s + b.best!.grade, 0) / done.length, 1) : null;
  const needsGrading = row.reduce((s, b) => s + b.pending, 0);

  return (
    <>
      <PageHeader
        title={quiz.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={quiz.published ? "success" : "warning"}>{quiz.published ? t("Published") : t("Draft")}</Badge>
            {classroom.name} · {question.length} {t("questions")}
            {quiz.durationMinutes ? t(" · {0} minutes", quiz.durationMinutes) : ""}
            {quiz.startsAt ? t(" · opens {0}", formatDateTime(quiz.startsAt)) : ""}
            {quiz.endsAt ? t(" · closes {0}", formatDateTime(quiz.endsAt)) : ""}
          </span>
        }
        action={
          <>
            <PublishButton id={quiz.id} published={quiz.published} />
            <Button asChild variant="outline">
              <Link href={`/teacher/quizzes/${quiz.id}/preview`}>
                <Eye /> {t("Preview")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/quizzes/${quiz.id}/edit`}>
                <Pencil /> {t("Edit")}
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Have taken it")} value={`${done.length}/${member.length}`} />
        <StatCard label={t("Average grade")} value={average ?? "–"} keterangan={t("best grade of each student")} />
        <StatCard label={t("Awaiting review")} value={needsGrading} keterangan={needsGrading ? t("answers need grading by the teacher") : t("everything is graded")} />
      </div>

      <h2 className="mb-3 text-lg font-bold">{t("Student results")}</h2>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">{t("Student")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("Status")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("Attempts")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("Best grade")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {row.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {t("There are no students in this class yet.")}
                </td>
              </tr>
            )}
            {row.map((b) => (
              <tr key={b.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-semibold">{b.name}</td>
                <td className="px-4 py-3">
                  {b.best ? <Badge tone="success">{t("Completed")}</Badge> : b.inProgress ? <Badge tone="warning">{t("In progress")}</Badge> : <Badge>{t("Not started")}</Badge>}
                  {b.pending > 0 && (
                    <Badge tone="danger" className="ml-1.5">
                      {b.pending} {t("needs grading")}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {b.count}/{quiz.maxAttempts}
                </td>
                <td className="px-4 py-3 text-lg font-extrabold">{b.best ? round(b.best.grade, 1) : "–"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {b.count > 0 && (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/teacher/quizzes/${quiz.id}/attempts/${b.best?.id}`}>{t("View answers")}</Link>
                      </Button>
                    )}
                    {(b.count > 0 || b.inProgress) && <ResetAttemptsButton quizId={quiz.id} studentId={b.id} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft/50 p-4">
        <p className="text-sm text-muted-foreground">{t("Deleting a quiz also deletes all student grades for it.")}</p>
        <DeleteQuizButton id={quiz.id} />
      </div>
    </>
  );
}
