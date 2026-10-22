import { NextResponse } from "next/server";
import { getOwnedMaterial } from "@/lib/access";
import { parseMarkdown } from "@/lib/markdown-ir";
import { markdownToDocx } from "@/lib/markdown-docx";
import { markdownToPdf } from "@/lib/markdown-pdf";
import { contentDisposition } from "@/lib/storage";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FORMATS = new Set(["pdf", "docx", "md"]);

/**
 * Download of one text lesson: PDF by default, or `?format=docx` / `?format=md`. PDF and DOCX are rendered
 * from the same parsed Markdown (see markdown-ir.ts) so they never drift from each other; `.md` is the raw
 * source, kept for use inside the app (e.g. re-importing), not meant as the primary format teachers reach for.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return new NextResponse(t("Not allowed"), { status: 403 });
  const { id } = await ctx.params;
  const material = await getOwnedMaterial(teacher.id, id);
  if (!material) return new NextResponse(t("Lesson not found."), { status: 404 });
  if (material.typeMedia !== "text" || !material.content.trim()) return new NextResponse(t("This lesson has no text content to download."), { status: 409 });

  const formatParam = new URL(req.url).searchParams.get("format") || "pdf";
  const format = FORMATS.has(formatParam) ? formatParam : "pdf";
  const title = material.title.trim() || "Materi";
  const baseName = title.replace(/["\r\n]/g, "").slice(0, 150);

  if (format === "md") {
    return new NextResponse(`# ${material.title}\n\n${material.content}\n`, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": contentDisposition(`${baseName}.md`), "Cache-Control": "no-store" },
    });
  }

  const blocks = parseMarkdown(material.content);
  if (format === "docx") {
    const file = await markdownToDocx(title, blocks);
    return new NextResponse(new Uint8Array(file), {
      headers: { "Content-Type": DOCX_MIME, "Content-Disposition": contentDisposition(`${baseName}.docx`), "Cache-Control": "no-store" },
    });
  }

  const file = await markdownToPdf(title, blocks);
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": contentDisposition(`${baseName}.pdf`), "Cache-Control": "no-store" },
  });
}
