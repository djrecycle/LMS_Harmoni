import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, CircleCheck, Mic } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { Badge, PageHeader, Progress, StatCard } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { isUuid, getOwnedClassroom } from "@/lib/access";
import { bestGrades, classStats } from "@/lib/data";
import { requireTeacher } from "@/lib/session";
import { formatDate, formatDateTime, today } from "@/lib/utils";
import { lte } from "drizzle-orm";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Student Report") };
}
const S = schema;

export default async function StudentReport({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id, studentId } = await params;
  const classroom = await getOwnedClassroom(teacher.id, id);
  if (!classroom || !isUuid(id)) notFound();

  const stat = await classStats(classroom.id);
  const student = stat.member.find((a) => a.id === studentId);
  if (!student) notFound();

  const quizIds = stat.quizPublished.map((k) => k.id);
  const [grade, attempt, material, progress, recording, practice] = await Promise.all([
    bestGrades(quizIds, [student.id]),
    quizIds.length
      ? db.select().from(S.attempt).where(and(eq(S.attempt.studentId, student.id), inArray(S.attempt.quizId, quizIds), eq(S.attempt.status, "completed"))).orderBy(desc(S.attempt.grade))
      : Promise.resolve([]),
    db
      .select({ id: S.material.id, title: S.material.title, date: S.classroomMaterial.date })
      .from(S.classroomMaterial)
      .innerJoin(S.material, eq(S.material.id, S.classroomMaterial.materialId))
      .where(and(eq(S.classroomMaterial.classroomId, classroom.id), lte(S.classroomMaterial.date, today())))
      .orderBy(desc(S.classroomMaterial.date)),
    db.select().from(S.materialProgress).where(and(eq(S.materialProgress.studentId, student.id), eq(S.materialProgress.completed, true))),
    db.select().from(S.recording).where(eq(S.recording.studentId, student.id)).orderBy(desc(S.recording.createdAt)),
    db.select().from(S.practiceResult).where(eq(S.practiceResult.studentId, student.id)).orderBy(desc(S.practiceResult.createdAt)).limit(10),
  ]);
  const completedSet = new Set(progress.map((p) => p.materialId));

  return (
    <>
      <Link href={`/teacher/classes/${classroom.id}`} className="no-print mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {classroom.name}
      </Link>
      <PageHeader title={`Report: ${student.name}`} description={t("{0} · {1} · printed {2}", student.email, classroom.name, formatDate(new Date()))} action={<div className="no-print"><PrintButton /></div>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Average grade")} value={student.averageGrade ?? "–"} keterangan={t("from the best grade of each quiz")} />
        <StatCard label="Quizzes completed" value={`${student.quizCompleted}/${stat.quizPublished.length}`} />
        <StatCard label={t("Lessons completed")} value={`${student.materialCompleted}/${stat.materialPublished}`} keterangan={t("progress {0}%", student.progress)} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold">{t("Quiz grades")}</h2>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t("Quizzes")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("Best grade")}</th>
                <th className="px-4 py-2.5 font-semibold">{t("Attempts")}</th>
                <th className="no-print px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {stat.quizPublished.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    {t("No published quizzes yet.")}
                  </td>
                </tr>
              )}
              {stat.quizPublished.map((k) => {
                const n = grade.find((x) => x.quizId === k.id);
                const p = attempt.filter((x) => x.quizId === k.id);
                return (
                  <tr key={k.id}>
                    <td className="px-4 py-2.5 font-semibold">{k.title}</td>
                    <td className="px-4 py-2.5 text-lg font-extrabold">{n ? Math.round(n.grade) : "–"}</td>
                    <td className="px-4 py-2.5">{p.length}</td>
                    <td className="no-print px-4 py-2.5 text-right">
                      {p[0] && (
                        <Link href={`/teacher/quizzes/${k.id}/attempts/${p[0].id}`} className="font-semibold text-primary hover:underline">
                          {t("View answers")}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("Lesson progress")}</h2>
          <Progress value={student.progress} className="mb-3" label={t("Lesson progress")} />
          <ul className="grid grid-cols-1 gap-1.5 text-sm">
            {material.length === 0 && <li className="text-muted-foreground">{t("No lessons have been published yet.")}</li>}
            {material.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words">{m.title}</span>
                {completedSet.has(m.id) ? (
                  <Badge tone="success" className="shrink-0">
                    <CircleCheck className="size-3" /> {t("Completed")}
                  </Badge>
                ) : (
                  <Badge className="shrink-0">{t("Not yet")}</Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("Latest practice")}</h2>
          {practice.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No pitch or rhythm practice yet.")}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-1.5 text-sm">
              {practice.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {h.title} <span className="text-xs text-muted-foreground">· {formatDateTime(h.createdAt)}</span>
                  </span>
                  <span className="shrink-0 font-extrabold">{h.score}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="no-print">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Mic className="size-5 text-primary" /> {t("Practice recordings (")}{recording.length})
        </h2>
        {recording.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("This student has not saved any recordings.")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recording.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-3.5 shadow-xs">
                <p className="font-semibold">{r.title}</p>
                <p className="mb-2 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</p>
                <audio controls preload="none" src={`/api/files/${r.fileKey}`} className="w-full" />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
