/** Text from an uploaded .docx / .pdf / .txt (port of core/importer.py: ekstrak_teks_docx, ekstrak_teks_pdf, baca_teks_berkas). */
import { AiError } from "../ai-error";
import { docxText } from "./docx-xml";

/** Largest upload accepted for a source document. */
export const MAX_SOURCE_BYTES = 3 * 1024 * 1024;

async function pdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text])
    .map((h) => h.trim())
    .filter(Boolean)
    .join("\n");
}

function plainText(data: Uint8Array): string {
  const buf = Buffer.from(data);
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  try {
    return utf8.decode(buf);
  } catch {
    return buf.toString("latin1"); // not UTF-8: fall back like the original app
  }
}

/** Read the text of an uploaded file. Throws an AiError with a user-safe message. */
export async function extractText(file: File): Promise<string> {
  if (file.size === 0) throw new AiError("The file is empty.");
  if (file.size > MAX_SOURCE_BYTES) throw new AiError("The file is too large (maximum 3 MB).");
  const name = file.name.toLowerCase();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    let text: string;
    if (name.endsWith(".docx")) text = await docxText(data);
    else if (name.endsWith(".pdf")) text = await pdfText(data);
    else if (name.endsWith(".txt") || name.endsWith(".md")) text = plainText(data);
    else throw new AiError("Unsupported file type. Use .docx, .pdf, or .txt.");
    if (!text.trim()) throw new AiError("No text could be read from this file. A scanned PDF has no text layer.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    console.error("[perangkat] extract text", e);
    throw new AiError("The file could not be read. Make sure it is a valid .docx, .pdf, or .txt file.");
  }
}
