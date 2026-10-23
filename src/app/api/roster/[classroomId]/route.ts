import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getOwnedClassroom } from "@/lib/access";
import { studentListToExcel, studentListToPdf } from "@/lib/student-list-export";
import { contentDisposition } from "@/lib/storage";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { memberOf, membersOf } from "@/lib/members";

export const runtime = "nodejs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const S = schema;

/** One class's student list (name + username), as a PDF (default) or `?format=xlsx` .xlsx file. */
export async function GET(req: Request, ctx: { params: Promise<{ classroomId: string }> }) {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return new NextResponse(t("Not allowed"), { status: 403 });
  const { classroomId } = await ctx.params;
  const classroom = await getOwnedClassroom(teacher.id, classroomId);
  if (!classroom) return new NextResponse(t("Class not found."), { status: 404 });

  const rows = await db
    .select({ name: S.user.name, username: S.user.username, email: S.user.email })
    .from(S.classroomMembership)
    .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
    .where(memberOf(classroom.id))
    .orderBy(S.user.name);

  const baseName = `Daftar_Siswa_${classroom.name}`.replace(/["\r\n]/g, "").slice(0, 150);
  const xlsx = new URL(req.url).searchParams.get("format") === "xlsx";
  const file = xlsx ? await studentListToExcel(classroom.name, teacher.name, rows) : await studentListToPdf(classroom.name, teacher.name, rows);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": xlsx ? XLSX_MIME : "application/pdf",
      "Content-Disposition": contentDisposition(`${baseName}.${xlsx ? "xlsx" : "pdf"}`),
      "Cache-Control": "no-store",
    },
  });
}
