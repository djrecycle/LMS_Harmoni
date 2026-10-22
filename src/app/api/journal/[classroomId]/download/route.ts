import { NextResponse } from "next/server";
import { getOwnedClassroom } from "@/lib/access";
import { journalForExport } from "@/lib/journal-data";
import { journalToExcel } from "@/lib/journal-excel";
import { journalToPdf } from "@/lib/journal-pdf";
import { contentDisposition } from "@/lib/storage";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FORMATS = new Set(["pdf", "xlsx"]);

/** Every journal entry for one class, printable as a PDF (default) or `?format=xlsx` .xlsx file — Jurnal Mengajar, per class. */
export async function GET(req: Request, ctx: { params: Promise<{ classroomId: string }> }) {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return new NextResponse(t("Not allowed"), { status: 403 });
  const { classroomId } = await ctx.params;
  const classroom = await getOwnedClassroom(teacher.id, classroomId);
  if (!classroom) return new NextResponse(t("Class not found."), { status: 404 });

  const formatParam = new URL(req.url).searchParams.get("format") || "pdf";
  const format = FORMATS.has(formatParam) ? formatParam : "pdf";
  const rows = await journalForExport(teacher.id, classroom.id);
  const baseName = `Jurnal_${classroom.name}`.replace(/["\r\n]/g, "").slice(0, 150);

  if (format === "xlsx") {
    const file = await journalToExcel(classroom.name, teacher.name, rows);
    return new NextResponse(new Uint8Array(file), {
      headers: { "Content-Type": XLSX_MIME, "Content-Disposition": contentDisposition(`${baseName}.xlsx`), "Cache-Control": "no-store" },
    });
  }

  const file = await journalToPdf(classroom.name, teacher.name, rows);
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(`${baseName}.pdf`), "Cache-Control": "no-store" },
  });
}
