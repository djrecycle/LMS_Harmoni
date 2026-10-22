/** Minimal .docx reading: unzip, parse the XML parts, and pull plain text out of paragraphs and tables. */
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

export type XEl = Element;

export type DocxParts = { document: XEl; numbering: XEl | null; styles: XEl | null };

const parse = (xml: string): XEl => new DOMParser().parseFromString(xml, "text/xml").documentElement as unknown as XEl;

/** Direct child elements with this tag (e.g. "w:p"). */
export function kids(el: XEl, tag: string): XEl[] {
  const out: XEl[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (n as XEl).tagName === tag) out.push(n as XEl);
  return out;
}

/** All descendant elements with this tag. */
export const all = (el: XEl, tag: string): XEl[] => Array.from(el.getElementsByTagName(tag)) as XEl[];

export const first = (el: XEl, tag: string): XEl | null => (el.getElementsByTagName(tag).item(0) as XEl | null) ?? null;

export const attr = (el: XEl | null | undefined, name: string): string | null => (el && el.hasAttribute(name) ? el.getAttribute(name) : null);

export async function openDocx(data: Buffer | Uint8Array | ArrayBuffer): Promise<DocxParts> {
  const zip = await JSZip.loadAsync(data);
  const document = zip.file("word/document.xml");
  if (!document) throw new Error("Not a valid .docx file (word/document.xml is missing).");
  const read = async (name: string) => (await zip.file(name)?.async("string")) ?? null;
  const [numbering, styles] = await Promise.all([read("word/numbering.xml"), read("word/styles.xml")]);
  return { document: parse(await document.async("string")), numbering: numbering ? parse(numbering) : null, styles: styles ? parse(styles) : null };
}

/** Text of one paragraph element (w:p): runs, tabs and line breaks. */
export function paragraphText(p: XEl): string {
  let out = "";
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      const e = c as XEl;
      if (e.tagName === "w:t") out += e.textContent ?? "";
      else if (e.tagName === "w:tab") out += "\t";
      else if (e.tagName === "w:br" || e.tagName === "w:cr") out += "\n";
      else if (e.tagName !== "w:pPr") walk(e);
    }
  };
  walk(p);
  return out;
}

/** Text of a table cell (w:tc): its paragraphs joined by new lines. */
export const cellText = (tc: XEl): string =>
  kids(tc, "w:p")
    .map(paragraphText)
    .join("\n")
    .trim();

/** Body children in document order: paragraphs and tables. */
export function bodyBlocks(document: XEl): XEl[] {
  const body = first(document, "w:body");
  if (!body) return [];
  const out: XEl[] = [];
  for (let n = body.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && ((n as XEl).tagName === "w:p" || (n as XEl).tagName === "w:tbl")) out.push(n as XEl);
  }
  return out;
}

/** All text of a .docx in reading order; table rows are joined by " | " (same as the original importer). */
export async function docxText(data: Buffer | Uint8Array | ArrayBuffer): Promise<string> {
  const { document } = await openDocx(data);
  const lines: string[] = [];
  for (const block of bodyBlocks(document)) {
    if (block.tagName === "w:p") {
      const t = paragraphText(block).trim();
      if (t) lines.push(t);
    } else {
      for (const tr of kids(block, "w:tr")) {
        const cells = kids(tr, "w:tc").map(cellText);
        if (cells.some(Boolean)) lines.push(cells.join(" | "));
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
