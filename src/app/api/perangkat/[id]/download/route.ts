import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { tulisDokumen } from "@/lib/perangkat/docx";
import { namaBerkasDariJudul } from "@/lib/perangkat/generator";
import { docContext, getOwnedDoc, getTemplate } from "@/lib/perangkat/store";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Word download of one saved document. For a Modul Ajar, `?template=<id>` re-renders it with another template. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return new NextResponse(t("Not allowed"), { status: 403 });
  const { id } = await ctx.params;
  const doc = await getOwnedDoc(teacher.id, id);
  if (!doc) return new NextResponse(t("Document not found."), { status: 404 });
  if (doc.status !== "done" || !doc.data) return new NextResponse(t("The document is not finished yet."), { status: 409 });

  const k = docContext(doc);
  const template = doc.kind === "modul_ajar" ? await getTemplate(teacher.id, new URL(req.url).searchParams.get("template") || k.template_id) : undefined;
  const file = await tulisDokumen(doc.kind, doc.data, { nama_sekolah: k.nama_sekolah, nama_guru: k.nama_guru, nama_kepala: k.nama_kepala, nip_guru: k.nip_guru, nip_kepala: k.nip_kepala, kota: k.kota, kelas: k.kelas }, template);
  const name = namaBerkasDariJudul(doc.title, doc.kind, k);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": DOCX,
      "Content-Disposition": `attachment; filename="${name.replace(/[^\w.\-]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
