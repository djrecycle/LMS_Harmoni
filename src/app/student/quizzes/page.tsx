import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { studentQuizzes } from "@/lib/student-data";
import { requireStudent } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Quizzes") };
}

export default async function StudentQuizList() {
  const t = await getT();
  const student = await requireStudent();
  const list = await studentQuizzes(student.id);
  return (
    <>
      <PageHeader title={t("Quizzes")} description={t("Take the quizzes from your teacher. There are text, audio, video, and piano questions!")} />
      {list.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={t("No quizzes yet")}>
          {t("Quizzes will appear here after your teacher publishes them.")}
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((k) => (
            <Link key={k.id} href={`/student/quizzes/${k.id}`} className="group rounded-xl border bg-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold group-hover:text-primary">{k.title}</h2>
                {k.bestGrades !== null && <span className="text-2xl leading-none font-extrabold text-primary">{Math.round(k.bestGrades)}</span>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {k.classroomName} · {k.questionCount} {t("questions")}{k.durationMinutes ? t(" · {0} minutes", k.durationMinutes) : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {k.attemptInProgressId ? (
                  <Badge tone="warning">{t("In progress")}</Badge>
                ) : k.status === "not_started" ? (
                  <Badge tone="neutral">{t("Opens")} {formatDateTime(k.startsAt)}</Badge>
                ) : k.status === "closed" ? (
                  <Badge tone="danger">{t("Closed")}</Badge>
                ) : k.attemptCompleted === 0 ? (
                  <Badge tone="primary">{t("Not taken yet")}</Badge>
                ) : k.bisaMencoba ? (
                  <Badge tone="primary">{t("Can be retaken")}</Badge>
                ) : (
                  <Badge tone="success">{t("Completed")}</Badge>
                )}
                {k.endsAt && k.status === "open" && <Badge>{t("Closes")} {formatDateTime(k.endsAt)}</Badge>}
                <Badge>
                  {k.attemptCompleted}/{k.maxAttempts} {t("attempts")}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
