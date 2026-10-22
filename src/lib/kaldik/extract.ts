/** Text extraction for an uploaded Kalender Pendidikan file (.docx / .pdf / .xlsx / .txt), for the AI prompt. */
import ExcelJS from "exceljs";
import { AiError } from "@/lib/ai-error";
import { docxText } from "@/lib/perangkat/docx-xml";

export const MAX_KALDIK_BYTES = 5 * 1024 * 1024;

async function pdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).map((h) => h.trim()).filter(Boolean).join("\n");
}

async function xlsxText(data: Uint8Array): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as never);
  const lines: string[] = [];
  for (const ws of wb.worksheets) {
    lines.push(`--- ${ws.name} ---`);
    ws.eachRow((row) => {
      const cells = (row.values as unknown[])
        .slice(1)
        .map((v) => {
          if (v === null || v === undefined) return "";
          if (typeof v === "object" && "text" in (v as Record<string, unknown>)) return String((v as { text: unknown }).text ?? "").trim();
          if (typeof v === "object" && "result" in (v as Record<string, unknown>)) return String((v as { result: unknown }).result ?? "").trim();
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          return String(v).trim();
        })
        .filter(Boolean);
      if (cells.length) lines.push(cells.join(" | "));
    });
  }
  return lines.join("\n");
}

function plainText(data: Uint8Array): string {
  const buf = Buffer.from(data);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

/** Read the text of an uploaded Kaldik file. Throws an AiError with a user-safe message. */
export async function extractKaldikText(file: File): Promise<string> {
  if (file.size === 0) throw new AiError("The file is empty.");
  if (file.size > MAX_KALDIK_BYTES) throw new AiError("The file is too large (maximum 5 MB).");
  const name = file.name.toLowerCase();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    let text: string;
    if (name.endsWith(".docx")) text = await docxText(data);
    else if (name.endsWith(".pdf")) text = await pdfText(data);
    else if (name.endsWith(".xlsx")) text = await xlsxText(data);
    else if (name.endsWith(".txt")) text = plainText(data);
    else throw new AiError("Unsupported file type. Use .docx, .pdf, .xlsx, or .txt.");
    if (!text.trim()) throw new AiError("No text could be read from this file. A scanned PDF has no text layer.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    console.error("[kaldik] extract text", e);
    throw new AiError("The file could not be read. Make sure it is a valid .docx, .pdf, .xlsx, or .txt file.");
  }
}
