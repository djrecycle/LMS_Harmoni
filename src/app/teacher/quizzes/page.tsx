import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Eye, FileCheck2, Pencil, Plus } from "lucide-react";
import { DeleteQuizButton } from "@/components/quiz-actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { teacherQuizList, type QuizSummary } from "@/lib/data";
import { requireTeacher } from "@/lib/session";
import { cn, formatDate, shortLabel } from "@/lib/utils";
import type { Translate } from "@/i18n";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Quizzes") };
}

export default async function QuizList({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { topic } = await searchParams;
  const all = await teacherQuizList(teacher.id);
  const topicList = [...new Set(all.flatMap((k) => k.topics))].sort();
  const list = topic ? all.filter((k) => (topic === "without" ? k.topics.length === 0 : k.topics.includes(topic))) : all;
  // Online runs of an exam are official assessments; everything else is a flexible classroom quiz.
  const hasExams = all.some((k) => k.examId);
  const exams = list.filter((k) => k.examId);
  const quizzes = list.filter((k) => !k.examId);
  const filtered = t("No quiz matches this TP / topic.");
  return (
    <>
      <PageHeader
        title={t("Quizzes")}
        description={t("Build quizzes from the question bank, schedule them for classes, and track the results.")}
        action={
          <Button asChild>
            <Link href="/teacher/quizzes/new">
              <Plus /> {t("New quiz")}
            </Link>
          </Button>
        }
      />
      {all.length > 0 && topicList.length > 0 && (
        <form className="mb-5 grid grid-cols-[1fr_auto] gap-2 sm:w-96">
          <Select name="topic" defaultValue={topic ?? ""} aria-label={t("Filter by TP")}>
            <option value="">{t("All TP / topics")}</option>
            {topicList.map((x) => (
              <option key={x} value={x} title={x}>
                {shortLabel(x)}
              </option>
            ))}
            <option value="without">{t("No topic")}</option>
          </Select>
          <Button type="submit" variant="outline">
            {t("Apply")}
          </Button>
        </form>
      )}
      {all.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={t("No quizzes yet")} action={<Button asChild><Link href="/teacher/quizzes/new">{t("Create your first quiz")}</Link></Button>}>
          {t("Quizzes are built from questions in the question bank. Prepare some questions first if you have none.")}
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          {hasExams && (
            <Section
              icon={<FileCheck2 />}
              title={t("Exams")}
              count={exams.length}
              description={t("Official assessments run online from the Exams menu. Their questions and weights follow the exam.")}
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/teacher/exams">{t("Open Exams")}</Link>
                </Button>
              }
            >
              {exams.length === 0 ? <p className="text-sm text-muted-foreground">{filtered}</p> : exams.map((k) => <QuizCard key={k.id} k={k} t={t} />)}
            </Section>
          )}
          <Section
            icon={<ClipboardList />}
            title={hasExams ? t("Classroom quizzes") : t("Quizzes")}
            count={quizzes.length}
            description={t("Checks during learning. Free to build, change, and reschedule at any time.")}
          >
            {quizzes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{topic ? filtered : t("No classroom quizzes yet.")}</p>
            ) : (
              quizzes.map((k) => <QuizCard key={k.id} k={k} t={t} />)
            )}
          </Section>
        </div>
      )}
    </>
  );
}

function Section({ icon, title, count, description, action, children }: { icon: React.ReactNode; title: string; count: number; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b pb-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold [&_svg]:size-5 [&_svg]:text-primary">
            {icon} {title} <Badge>{count}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function QuizCard({ k, t }: { k: QuizSummary; t: Translate }) {
  return (
    <div className={cn("relative rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary hover:shadow-md", k.examId && "border-l-4 border-l-primary")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/teacher/quizzes/${k.id}`} className="font-bold break-words after:absolute after:inset-0 after:rounded-xl">
              {k.title}
            </Link>
            {k.examId && <Badge tone="primary">{t("Exam")}</Badge>}
            <Badge tone={k.published ? "success" : "warning"}>{k.published ? t("Published") : t("Draft")}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {k.classroomName} · {k.questionCount} {t("questions · created")} {formatDate(k.createdAt)}
          </p>
          {k.topics.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {k.topics.slice(0, 2).map((x) => (
                <Badge key={x} className="max-w-full break-words">
                  {x}
                </Badge>
              ))}
              {k.topics.length > 2 && <Badge>+{k.topics.length - 2}</Badge>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t("Completed")}</p>
            <p className="font-extrabold">
              {k.hasTaken}/{k.studentCount}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t("Average")}</p>
            <p className="font-extrabold">{k.averageGrade ?? "–"}</p>
          </div>
        </div>
      </div>
      <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/teacher/quizzes/${k.id}/preview`}>
            <Eye /> {t("Preview")}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/teacher/quizzes/${k.id}/edit`}>
            <Pencil /> {t("Edit")}
          </Link>
        </Button>
        {k.examId && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/teacher/exams/${k.examId}`}>
              <FileCheck2 /> {t("Open exam")}
            </Link>
          </Button>
        )}
        <DeleteQuizButton id={k.id} compact />
      </div>
    </div>
  );
}
