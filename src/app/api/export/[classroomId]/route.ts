import { NextResponse } from "next/server";
import { getOwnedClassroom } from "@/lib/access";
import { classGradeMatrix } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";

/** Safe CSV cell: quote when needed, and neutralize formula prefixes (= + - @) so Excel/Sheets do not execute them. */
function cell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_: Request, ctx: { params: Promise<{ classroomId: string }> }) {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return new NextResponse(t("Not allowed"), { status: 403 });
  const { classroomId } = await ctx.params;
  const classroom = await getOwnedClassroom(teacher.id, classroomId);
  if (!classroom) return new NextResponse(t("Class not found"), { status: 404 });

  const r = await classGradeMatrix(classroom.id);
  const row: (string | number | null)[][] = [
    ["Name", "Email", ...r.quiz.map((k) => k.title), "Average-average", "Quizzes completed"],
    ...r.student.map((s) => [s.name, s.email, ...r.quiz.map((k) => s.grade[k.id]), s.average, `${s.completed}/${r.quiz.length}`]),
    ["Class average", "", ...r.quiz.map((k) => r.quizAverage[k.id]), r.classAverage, ""],
  ];
  const csv = "﻿" + row.map((b) => b.map(cell).join(",")).join("\r\n");
  const name = classroom.name.replace(/[^\w\-]+/g, "_").slice(0, 60) || "classroom";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grades-export-${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
