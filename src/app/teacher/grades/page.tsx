import type { Metadata } from "next";
import Link from "next/link";
import { Download, School } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { classGradeMatrix } from "@/lib/data";
import { requireTeacher } from "@/lib/session";
import { cn, formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Grades & Reports") };
}

const gradeTone = (n: number | null) => (n === null ? "text-muted-foreground" : n >= 75 ? "text-success" : n >= 55 ? "text-foreground" : "text-danger");

export default async function TeacherGrades({ searchParams }: { searchParams: Promise<{ classroom?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { classroom: classroomParam } = await searchParams;
  const classroomList = await db.select().from(schema.classroom).where(eq(schema.classroom.teacherId, teacher.id)).orderBy(schema.classroom.name);
  const classroom = classroomList.find((k) => k.id === classroomParam) ?? classroomList[0];

  if (!classroom) {
    return (
      <>
        <PageHeader title={t("Grades & Reports")} />
        <EmptyState icon={<School />} title={t("No classes yet")}>
          {t("Create a class and a quiz first. Grades are calculated automatically from student quiz results.")}
        </EmptyState>
      </>
    );
  }
  const r = await classGradeMatrix(classroom.id);

  return (
    <>
      <PageHeader
        title={t("Grades & Reports")}
        description={t("Automatic grade summary from quiz results. The grade for each quiz is the student's best attempt.")}
        action={
          <div className="no-print flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/api/export/${classroom.id}`} download>
                <Download /> {t("Download CSV")}
              </a>
            </Button>
            <PrintButton />
          </div>
        }
      />

      <div className="no-print mb-5 flex flex-wrap gap-2">
        {classroomList.map((k) => (
          <Link key={k.id} href={`?classroom=${k.id}`} className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", k.id === classroom.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {k.name}
          </Link>
        ))}
      </div>

      <div className="mb-3 hidden print:block">
        <p className="text-lg font-bold">{t("Grade summary:")} {classroom.name}</p>
        <p className="text-sm">{t("Printed")} {formatDate(new Date())}</p>
      </div>

      {r.student.length === 0 ? (
        <EmptyState title={t("There are no students in this class yet")} />
      ) : r.quiz.length === 0 ? (
        <EmptyState title={t("No published quizzes yet")}>{t("Grades appear after a quiz is published and students take it.")}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t("Student")}</th>
                {r.quiz.map((k) => (
                  <th key={k.id} className="px-3 py-2.5 text-center font-semibold">
                    <Link href={`/teacher/quizzes/${k.id}`} className="hover:underline">
                      {k.title}
                    </Link>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-center font-semibold">{t("Average")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.student.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/teacher/classes/${classroom.id}/students/${s.id}`} className="font-semibold hover:text-primary hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  {r.quiz.map((k) => (
                    <td key={k.id} className={cn("px-3 py-2.5 text-center font-bold", gradeTone(s.grade[k.id]))}>
                      {s.grade[k.id] === null ? "–" : Math.round(s.grade[k.id]!)}
                    </td>
                  ))}
                  <td className={cn("px-4 py-2.5 text-center text-base font-extrabold", gradeTone(s.average))}>{s.average === null ? "–" : Math.round(s.average)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/40 font-bold">
              <tr>
                <td className="px-4 py-2.5">Class average</td>
                {r.quiz.map((k) => (
                  <td key={k.id} className="px-3 py-2.5 text-center">
                    {r.quizAverage[k.id] === null ? "–" : Math.round(r.quizAverage[k.id]!)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-center text-base">{r.classAverage === null ? "–" : Math.round(r.classAverage)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="no-print mt-3 text-xs text-muted-foreground">{t("Click a student's name to see the full report, answers, and practice recordings.")}</p>
    </>
  );
}
