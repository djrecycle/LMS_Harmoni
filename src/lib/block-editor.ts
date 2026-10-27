/**
 * Parses a lesson's Markdown content into a flat list of editable blocks for the drag-and-drop block
 * editor (src/components/block-editor.tsx), and serializes that block list back to Markdown. Generic
 * blocks (heading/paragraph/list/table/divider) keep their exact raw Markdown substring — sliced from
 * the original string via remark's position offsets — so editing one block never reformats another.
 * Anything this editor doesn't have a dedicated widget for (blockquotes, raw HTML, an unrecognized code
 * block, …) still round-trips as an "other" raw block so content is never silently dropped.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent } from "mdast";
import { CHORDS_DEFAULT_BPM, decodeFence, type Meter, fenceChords, fenceMedia, fenceRhythm, fenceSong, MELODY_BLOCK_BPM, melodyToSongNotes, RHYTHM_DEFAULT_BPM } from "./music-blocks";
import { noteToMidi } from "./music";
import { notesToRoll, parseSongNotation, type SongNote } from "./songs";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";

export type RawKind = "heading" | "paragraph" | "bullet-list" | "numbered-list" | "table" | "hr" | "other";

export type EditorBlock =
  | { id: string; type: "raw"; kind: RawKind; depth?: number; markdown: string }
  | { id: string; type: "media"; kind: "audio" | "video"; key: string; title: string }
  | { id: string; type: "rhythm"; pattern: NoteGlyphKind[]; bpm: number; meter: Meter }
  | { id: string; type: "chords"; label: string; items: string[]; beats: number[]; bpm: number; meter: Meter }
  | { id: string; type: "song"; title: string; bpm: number; doNote: string; notes: SongNote[] };

export type AddKind = "heading" | "paragraph" | "bullet-list" | "numbered-list" | "table" | "hr" | "audio" | "video" | "rhythm" | "chords" | "song";

let seq = 0;
function nextId(): string {
  seq += 1;
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `b${Date.now()}-${seq}`;
}

function rawKind(node: RootContent): { kind: RawKind; depth?: number } {
  if (node.type === "heading") return { kind: "heading", depth: node.depth };
  if (node.type === "paragraph") return { kind: "paragraph" };
  if (node.type === "list") return { kind: node.ordered ? "numbered-list" : "bullet-list" };
  if (node.type === "table") return { kind: "table" };
  if (node.type === "thematicBreak") return { kind: "hr" };
  return { kind: "other" };
}

export function parseToBlocks(markdown: string): EditorBlock[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const blocks: EditorBlock[] = [];

  for (const node of tree.children as RootContent[]) {
    if (node.type === "code") {
      const decoded = decodeFence(node.lang, node.value);
      if (decoded) {
        switch (decoded.lang) {
          case "media:audio":
          case "media:video":
            blocks.push({ id: nextId(), type: "media", kind: decoded.kind, key: decoded.key, title: decoded.title ?? "" });
            break;
          case "music:rhythm":
            blocks.push({ id: nextId(), type: "rhythm", pattern: decoded.pattern, bpm: decoded.bpm ?? RHYTHM_DEFAULT_BPM, meter: decoded.meter ?? "4/4" });
            break;
          case "music:chords":
            blocks.push({
              id: nextId(),
              type: "chords",
              label: decoded.label ?? "",
              items: decoded.items,
              beats: decoded.beats ?? decoded.items.map(() => 4),
              bpm: decoded.bpm ?? CHORDS_DEFAULT_BPM,
              meter: decoded.meter ?? "4/4",
            });
            break;
          case "music:song": {
            const r = parseSongNotation("roll", decoded.roll);
            const doNote = decoded.doNote && noteToMidi(decoded.doNote) !== null ? decoded.doNote : "C4";
            blocks.push({ id: nextId(), type: "song", title: decoded.title ?? "", bpm: decoded.bpm, doNote, notes: r.ok ? r.notes : [] });
            break;
          }
          case "music:melody":
            // The old Melody block is now a song block; it is saved in the new format on the next save.
            blocks.push({ id: nextId(), type: "song", title: "", bpm: MELODY_BLOCK_BPM, doNote: "C4", notes: melodyToSongNotes(decoded) });
            break;
        }
        continue;
      }
    }
    if (!node.position) continue;
    const markdownSlice = markdown.slice(node.position.start.offset, node.position.end.offset);
    const { kind, depth } = rawKind(node);
    blocks.push({ id: nextId(), type: "raw", kind, depth, markdown: markdownSlice });
  }
  return blocks;
}

export function serializeBlocks(blocks: EditorBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "raw") return b.markdown;
      if (b.type === "media") return fenceMedia({ kind: b.kind, key: b.key, title: b.title.trim() || undefined });
      if (b.type === "rhythm") return fenceRhythm({ pattern: b.pattern, bpm: b.bpm, meter: b.meter === "4/4" ? undefined : b.meter });
      if (b.type === "chords") return fenceChords({ label: b.label.trim() || undefined, items: b.items, beats: b.beats, bpm: b.bpm, meter: b.meter === "4/4" ? undefined : b.meter });
      return fenceSong({ title: b.title.trim() || undefined, bpm: b.bpm, doNote: b.doNote === "C4" ? undefined : b.doNote, roll: notesToRoll(b.notes) });
    })
    .join("\n\n");
}

export function emptyBlock(kind: AddKind): EditorBlock {
  switch (kind) {
    case "heading":
      return { id: nextId(), type: "raw", kind: "heading", depth: 2, markdown: "## " };
    case "paragraph":
      return { id: nextId(), type: "raw", kind: "paragraph", markdown: "" };
    case "bullet-list":
      return { id: nextId(), type: "raw", kind: "bullet-list", markdown: "- " };
    case "numbered-list":
      return { id: nextId(), type: "raw", kind: "numbered-list", markdown: "1. " };
    case "table":
      return { id: nextId(), type: "raw", kind: "table", markdown: "| Column 1 | Column 2 |\n| --- | --- |\n|  |  |" };
    case "hr":
      return { id: nextId(), type: "raw", kind: "hr", markdown: "---" };
    case "audio":
      return { id: nextId(), type: "media", kind: "audio", key: "", title: "" };
    case "video":
      return { id: nextId(), type: "media", kind: "video", key: "", title: "" };
    case "rhythm":
      return { id: nextId(), type: "rhythm", pattern: [], bpm: RHYTHM_DEFAULT_BPM, meter: "4/4" };
    case "chords":
      return { id: nextId(), type: "chords", label: "", items: [], beats: [], bpm: CHORDS_DEFAULT_BPM, meter: "4/4" };
    case "song":
      return { id: nextId(), type: "song", title: "", bpm: 90, doNote: "C4", notes: [] };
  }
}

/** Re-templates a raw block's markdown prefix when the teacher switches its kind in the UI. Best-effort — strips the old prefix and applies the new one, line by line for lists. */
export function retemplateRaw(block: Extract<EditorBlock, { type: "raw" }>, kind: RawKind, depth?: number): EditorBlock {
  const stripPrefix = (line: string) => line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
  if (kind === "heading") {
    const text = stripPrefix(block.markdown.split("\n")[0] ?? "") || "Section heading";
    return { ...block, kind, depth: depth ?? 2, markdown: `${"#".repeat(depth ?? 2)} ${text}` };
  }
  if (kind === "bullet-list" || kind === "numbered-list") {
    const lines = block.markdown.split("\n").filter(Boolean);
    const items = lines.length ? lines.map(stripPrefix) : ["item"];
    const markdown = items.map((t, i) => (kind === "bullet-list" ? `- ${t}` : `${i + 1}. ${t}`)).join("\n");
    return { ...block, kind, depth: undefined, markdown };
  }
  if (kind === "paragraph") {
    const text = stripPrefix(block.markdown.split("\n")[0] ?? "");
    return { ...block, kind, depth: undefined, markdown: text };
  }
  return block;
}
