import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ringkas } from "@/lib/perangkat/generator";
import { docContext, expireStale, getOwnedDoc } from "@/lib/perangkat/store";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

/** Progress of one generation. The page polls this while a document is "pending". */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return NextResponse.json({ error: t("Not allowed") }, { status: 403, headers: noStore });
  const { id } = await ctx.params;

  await expireStale(teacher.id);
  const doc = await getOwnedDoc(teacher.id, id);
  if (!doc) return NextResponse.json({ error: t("Document not found.") }, { status: 404, headers: noStore });

  return NextResponse.json(
    {
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      status: doc.status,
      error: doc.error ? t(doc.error) : null,
      provider: doc.provider,
      summary: doc.status === "done" ? ringkas(doc.kind, doc.data, docContext(doc)) : "",
    },
    { headers: noStore },
  );
}
