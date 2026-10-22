import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getOwnedCalendar } from "@/lib/access";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

/** Progress of one Kalender Pendidikan import. Polled while the row is "pending". */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return NextResponse.json({ error: t("Not allowed") }, { status: 403, headers: noStore });
  const { id } = await ctx.params;
  const doc = await getOwnedCalendar(teacher.id, id);
  if (!doc) return NextResponse.json({ error: t("Document not found.") }, { status: 404, headers: noStore });
  return NextResponse.json({ id: doc.id, title: doc.title, status: doc.status, error: doc.error ? t(doc.error) : null, provider: doc.provider }, { headers: noStore });
}
