import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Trophy } from "lucide-react";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { PRACTICE_KIND_LABEL } from "@/lib/practice";
import { studentQuizzes } from "@/lib/student-data";
import { requireStudent } from "@/lib/session";
import { round, formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("My Grades") };
}
const S = schema;

export default async function MyGrades() {
  const t = await getT();
  const student = await requireStudent();
  const [quiz, attempt, practice] = await Promise.all([
    studentQuizzes(student.id),
    db
      .select({ p: S.attempt, title: S.quiz.title })
      .from(S.attempt)
      .innerJoin(S.quiz, eq(S.quiz.id, S.attempt.quizId))
      .where(eq(S.attempt.studentId, student.id))
      .orderBy(desc(S.attempt.startedAt)),
    db.select().from(S.practiceResult).where(eq(S.practiceResult.studentId, student.id)).orderBy(desc(S.practiceResult.createdAt)).limit(15),
  ]);
  const completed = attempt.filter((x) => x.p.status === "completed");
  const graded = quiz.filter((k) => k.bestGrades !== null);
  const average = graded.length ? round(graded.reduce((a, k) => a + k.bestGrades!, 0) / graded.length, 1) : null;

  return (
    <>
      <PageHeader title={t("My Grades")} description={t("Your quiz and practice grade history.")} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Average grade")} value={average ?? "–"} icon={<Trophy />} keterangan={t("from the best grade of each quiz")} />
        <StatCard label={t("Quizzes taken")} value={`${graded.length}/${quiz.length}`} />
        <StatCard label={t("Total attempts")} value={completed.length} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold">{t("Quiz history")}</h2>
        {completed.length === 0 ? (
          <EmptyState title={t("No quizzes taken yet")}>
            <Link href="/student/quizzes" className="font-semibold text-primary hover:underline">
              {t("View quiz list")}
            </Link>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {completed.map(({ p, title }) => (
              <Link key={p.id} href={`/student/quizzes/${p.quizId}/result/${p.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-xs transition hover:border-primary">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(p.completedAt)}
                    {p.pendingReview > 0 && <Badge tone="warning" className="ml-2">{p.pendingReview} {t("awaiting teacher")}</Badge>}
                  </p>
                </div>
                <span className="shrink-0 text-2xl font-extrabold text-primary">{Math.round(p.grade)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {practice.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("Practice scores")}</h2>
          <div className="grid grid-cols-1 gap-2">
            {practice.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-xs">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{h.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="primary">{t(PRACTICE_KIND_LABEL[h.kind])}</Badge>
                  <span className="text-xl font-extrabold">{h.score}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
