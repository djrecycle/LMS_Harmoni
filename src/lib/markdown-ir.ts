/**
 * Turns a lesson's Markdown content into a small block/run tree that the PDF and DOCX exporters both
 * render from, so the two formats never drift apart. Covers what the AI generators and the manual editor
 * actually produce: headings, paragraphs with bold/italic/links, bullet/numbered lists, GFM tables, and
 * the music blocks (audio/video clip, rhythm pattern, chords/notes) encoded as fenced code blocks (see
 * src/lib/music-blocks.ts). Blockquotes, images, raw HTML, and any other code block are not used by
 * lesson content and are skipped.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Code, List, PhrasingContent, Root, RootContent, Table } from "mdast";
import { decodeFence, type MelodyNote } from "./music-blocks";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";

export type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string };

export type Block =
  | { type: "heading"; depth: number; runs: Run[] }
  | { type: "paragraph"; runs: Run[] }
  | { type: "list"; ordered: boolean; items: Run[][] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "hr" }
  | { type: "media"; kind: "audio" | "video"; key: string; title?: string }
  | { type: "rhythm"; pattern: NoteGlyphKind[] }
  | { type: "chords"; label?: string; items: string[] }
  | { type: "melody"; length: number; notes: MelodyNote[] };

function musicBlock(node: Code): Block | null {
  const decoded = decodeFence(node.lang, node.value);
  if (!decoded) return null;
  switch (decoded.lang) {
    case "media:audio":
    case "media:video":
      return { type: "media", kind: decoded.kind, key: decoded.key, title: decoded.title };
    case "music:rhythm":
      return { type: "rhythm", pattern: decoded.pattern };
    case "music:chords":
      return { type: "chords", label: decoded.label, items: decoded.items };
    case "music:melody":
      return { type: "melody", length: decoded.length, notes: decoded.notes };
  }
}

function inlineRuns(nodes: PhrasingContent[], fmt: Omit<Run, "text"> = {}): Run[] {
  const out: Run[] = [];
  for (const n of nodes) {
    if (n.type === "text") out.push({ text: n.value, ...fmt });
    else if (n.type === "strong") out.push(...inlineRuns(n.children, { ...fmt, bold: true }));
    else if (n.type === "emphasis") out.push(...inlineRuns(n.children, { ...fmt, italic: true }));
    else if (n.type === "inlineCode") out.push({ text: n.value, ...fmt, code: true });
    else if (n.type === "link") out.push(...inlineRuns(n.children, { ...fmt, link: n.url }));
    else if (n.type === "break") out.push({ text: "\n", ...fmt });
    else if ("children" in n) out.push(...inlineRuns(n.children as PhrasingContent[], fmt));
  }
  return out;
}

const cellText = (nodes: PhrasingContent[]) =>
  inlineRuns(nodes)
    .map((r) => r.text)
    .join("")
    .trim();

function listItems(node: List): Run[][] {
  return node.children.map((item) => item.children.filter((c) => c.type === "paragraph").flatMap((p) => inlineRuns(p.children)));
}

function tableBlock(node: Table): Block {
  const [head, ...body] = node.children;
  return {
    type: "table",
    header: (head?.children ?? []).map((c) => cellText(c.children)),
    rows: body.map((r) => r.children.map((c) => cellText(c.children))),
  };
}

export function parseMarkdown(md: string): Block[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as Root;
  const blocks: Block[] = [];
  for (const node of tree.children as RootContent[]) {
    if (node.type === "heading") blocks.push({ type: "heading", depth: node.depth, runs: inlineRuns(node.children) });
    else if (node.type === "paragraph") blocks.push({ type: "paragraph", runs: inlineRuns(node.children) });
    else if (node.type === "list") blocks.push({ type: "list", ordered: Boolean(node.ordered), items: listItems(node) });
    else if (node.type === "table") blocks.push(tableBlock(node));
    else if (node.type === "thematicBreak") blocks.push({ type: "hr" });
    else if (node.type === "code") {
      const block = musicBlock(node);
      if (block) blocks.push(block);
    }
  }
  return blocks;
}
