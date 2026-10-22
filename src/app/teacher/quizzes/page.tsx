import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Eye, Pencil, Plus } from "lucide-react";
import { DeleteQuizButton } from "@/components/quiz-actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { teacherQuizList } from "@/lib/data";
import { requireTeacher } from "@/lib/session";
import { formatDate, shortLabel } from "@/lib/utils";
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
      {list.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={t("No quizzes yet")} action={<Button asChild><Link href="/teacher/quizzes/new">{t("Create your first quiz")}</Link></Button>}>
          {all.length > 0 ? t("No quiz matches this TP / topic.") : t("Quizzes are built from questions in the question bank. Prepare some questions first if you have none.")}
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {list.map((k) => (
            <div key={k.id} className="relative rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/teacher/quizzes/${k.id}`} className="font-bold after:absolute after:inset-0 after:rounded-xl">
                    {k.title}
                  </Link>
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
                <DeleteQuizButton id={k.id} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
