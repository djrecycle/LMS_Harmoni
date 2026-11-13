import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { cbtDocx, imageInfo, kisiDocx, type DocImage, type DocItem } from "@/lib/exam-docx";
import { mimeFromKey, readFileBytes } from "@/lib/storage";
import { getOwnedExam, listExamItems } from "@/lib/exam-store";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";

/** Notation images are drawn at double pixel density: show them at their real size in Word. */
const atSize = (img: DocImage | null, drawn: boolean): DocImage | null => (img && drawn ? { ...img, width: Math.round(img.width / 2), height: Math.round(img.height / 2) } : img);

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Word downloads of an exam: `kisi` (blueprint) or `cbt` (question sheet in the CBT upload template). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const t = await getT();
  const teacher = await getCurrentUser();
  if (!teacher || teacher.role !== "teacher") return new NextResponse(t("Not allowed"), { status: 403 });
  const { id, file } = await ctx.params;
  if (file !== "kisi" && file !== "cbt") return new NextResponse(t("Document not found."), { status: 404 });
  const exam = await getOwnedExam(teacher.id, id);
  if (!exam) return new NextResponse(t("Exam not found."), { status: 404 });

  const rows = await listExamItems(exam.id);
  // Question images go into the CBT file (uploaded files, or notation drawn as PNG). Links and WebP/AVIF cannot be embedded.
  const images = new Map<string, DocImage | null>();
  if (file === "cbt") {
    for (const { question } of rows) {
      for (const key of [question?.mediaKey, ...(question?.optionImages ?? [])]) {
        if (!key || images.has(key) || mimeFromKey(key).split("/")[0] !== "image") continue;
        const bytes = await readFileBytes(key);
        images.set(key, bytes ? imageInfo(bytes) : null);
      }
    }
  }
  const items: DocItem[] = rows.map(({ item, question }) => ({
    section: item.section,
    tp: item.tp,
    materi: item.materi,
    indikator: item.indikator,
    level: item.level,
    question: question
      ? {
          prompt: question.prompt,
          options: question.options, matchRows: question.matchRows, answerKey: question.answerKey, image: question.mediaKey ? atSize(images.get(question.mediaKey) ?? null, Boolean(question.notation)) : null,
          optionImages: question.optionImages?.map((k) => (k ? (images.get(k) ?? null) : null)) ?? null,
        }
      : null,
  }));
  const buffer = file === "kisi" ? await kisiDocx(exam.title, exam.info, items) : await cbtDocx(items);
  const name = `${file === "kisi" ? "Kisi-kisi" : "Soal CBT"} ${exam.title}.docx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX,
      "Content-Disposition": `attachment; filename="${name.replace(/[^\w.\-]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
