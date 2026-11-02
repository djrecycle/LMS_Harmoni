import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { getOwnedPracticeMaterial } from "@/lib/access";
import { membersOf } from "@/lib/members";
import { requireTeacher } from "@/lib/session";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Student scores") };
}
const S = schema;
const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 55 ? "text-foreground" : "text-danger");

/** Scores students got playing the songs of one practice material in "Perform" mode, per student, with each attempt. */
export default async function PracticeMaterialScores({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ class?: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const material = await getOwnedPracticeMaterial(teacher.id, id);
  if (!material) notFound();

  const classes = await db
    .select({ id: S.classroom.id, name: S.classroom.name })
    .from(S.classroomPracticeMaterial)
    .innerJoin(S.classroom, eq(S.classroom.id, S.classroomPracticeMaterial.classroomId))
    .where(eq(S.classroomPracticeMaterial.practiceMaterialId, material.id))
    .orderBy(asc(S.classroom.name));
  const { class: classParam } = await searchParams;
  const classId = classes.some((c) => c.id === classParam) ? classParam! : "all";

  const members = classes.length
    ? await db
        .select({ studentId: S.classroomMembership.studentId, classId: S.classroomMembership.classroomId, name: S.user.name })
        .from(S.classroomMembership)
        .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
        .where(membersOf(classes.map((c) => c.id)))
    : [];
  const studentIds = [...new Set(members.map((m) => m.studentId))];
  const results = studentIds.length
    ? await db
        .select({ studentId: S.practiceResult.studentId, title: S.practiceResult.title, score: S.practiceResult.score, detail: S.practiceResult.detail, createdAt: S.practiceResult.createdAt })
        .from(S.practiceResult)
        .where(and(eq(S.practiceResult.practiceMaterialId, material.id), inArray(S.practiceResult.studentId, studentIds)))
        .orderBy(desc(S.practiceResult.createdAt))
    : [];

  const className = new Map(classes.map((c) => [c.id, c.name]));
  const students = new Map<string, { name: string; classIds: string[] }>();
  for (const m of members) {
    const s = students.get(m.studentId) ?? { name: m.name, classIds: [] };
    s.classIds.push(m.classId);
    students.set(m.studentId, s);
  }
  const rows = [...students.entries()]
    .filter(([, s]) => classId === "all" || s.classIds.includes(classId))
    .map(([studentId, s]) => {
      const list = results.filter((r) => r.studentId === studentId); // newest first
      return {
        studentId,
        name: s.name,
        classNames: s.classIds.map((c) => className.get(c) ?? ""),
        list,
        best: list.length ? Math.max(...list.map((r) => r.score)) : null,
        last: list[0]?.score ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const played = rows.filter((r) => r.list.length > 0);
  const average = played.length ? Math.round(played.reduce((s, r) => s + r.best!, 0) / played.length) : null;

  return (
    <>
      <Link href="/teacher/practice-materials" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Practice Materials")}
      </Link>
      <PageHeader title={t("Student scores")} description={t("{0} — scores from playing the songs in Perform mode.", material.title)} />

      {classes.length === 0 ? (
        <EmptyState title={t("This practice material is not shown to any class yet")}>{t("Choose its classes on the edit page; scores appear here once students play its songs.")}</EmptyState>
      ) : (
        <div className="grid gap-5">
          {classes.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {[{ id: "all", name: t("All classes") }, ...classes].map((c) => (
                <Link
                  key={c.id}
                  href={c.id === "all" ? "?" : `?class=${c.id}`}
                  aria-current={classId === c.id ? "page" : undefined}
                  className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", classId === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          <div className="rounded-xl border bg-card p-4 text-sm shadow-xs">
            {t("{0} of {1} students have played.", played.length, rows.length)}
            {average !== null && ` ${t("Average best score: {0}.", average)}`}{" "}
            <span className="text-muted-foreground">{t("Only Perform mode is scored; Practice mode is not recorded.")}</span>
          </div>

          {rows.length === 0 ? (
            <EmptyState title={t("There are no students in this class yet")} />
          ) : (
            <div className="grid gap-3">
              {rows.map((r) => (
                <div key={r.studentId} className="grid gap-2 rounded-xl border bg-card p-4 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold break-words">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.classNames.join(", ")}
                        {r.list.length > 0 && ` · ${t("last played {0}", formatDate(r.list[0].createdAt))}`}
                      </p>
                    </div>
                    {r.best !== null && (
                      <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                        <span className="text-xs text-muted-foreground">({t("{0}×", r.list.length)})</span>
                        <span className="ml-2">
                          {t("best")} <b className={scoreTone(r.best)}>{r.best}</b> · {t("last")} <b className={scoreTone(r.last!)}>{r.last}</b>
                        </span>
                      </div>
                    )}
                  </div>
                  {r.list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("Not played yet")}</p>
                  ) : (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-semibold text-primary">{t("All attempts")}</summary>
                      <ul className="mt-2 grid gap-1">
                        {r.list.map((a, i) => {
                          const wrong = typeof a.detail?.wrong === "number" ? a.detail.wrong : null;
                          return (
                            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b py-1 last:border-0">
                              <span className="min-w-0 break-words">
                                {a.title}
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  · {formatDateTime(a.createdAt)}
                                  {wrong !== null && ` · ${t("{0} mistakes", wrong)}`}
                                </span>
                              </span>
                              <b className={cn("tabular-nums", scoreTone(a.score))}>{a.score}</b>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
