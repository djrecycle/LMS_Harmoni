import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildRosterTemplate } from "@/lib/roster-upload";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";

/** The downloadable .xlsx template for the "classes + students" bulk upload. */
export async function GET() {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return new NextResponse(t("Not allowed"), { status: 403 });
  const file = await buildRosterTemplate();
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template_siswa_kelas.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
