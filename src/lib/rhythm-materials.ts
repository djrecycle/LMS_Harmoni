/**
 * Rhythm blocks of a teacher's practice materials become patterns in the students' Rhythm Practice
 *  (src/components/rhythm-practice.tsx). A material that holds nothing but rhythm (text allowed, no other music
 *  or media) is not listed as a separate card on the Practice page: it lives in Rhythm Practice instead.
 */
import { decodeFence, RHYTHM_DEFAULT_BPM } from "./music-blocks";
import type { RhythmPattern } from "./practice";
import { rhythmBeats, rhythmOnsets, rhythmToText } from "./rhythm";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";

// Saved form content uses CRLF line breaks, so both kinds are accepted.
const FENCE = /```([a-z]+:[a-z]+)\r?\n([\s\S]*?)\r?\n```/g;

/** The rhythm blocks of a material's Markdown, in order. */
export function rhythmBlocksOf(content: string): { pattern: NoteGlyphKind[]; bpm: number }[] {
  const out: { pattern: NoteGlyphKind[]; bpm: number }[] = [];
  for (const m of content.matchAll(FENCE)) {
    const d = decodeFence(m[1], m[2]);
    if (d?.lang === "music:rhythm" && d.pattern.length && rhythmOnsets(d.pattern).length) out.push({ pattern: d.pattern, bpm: d.bpm ?? RHYTHM_DEFAULT_BPM });
  }
  return out;
}

/** True when the material is only rhythm practice: at least one rhythm block, no other music/media block, text media. */
export function isRhythmOnly(material: { content: string; typeMedia: string }): boolean {
  if (material.typeMedia !== "text") return false;
  const langs = [...material.content.matchAll(FENCE)].map((m) => m[1]);
  return langs.includes("music:rhythm") && langs.every((l) => l === "music:rhythm" || !(l.startsWith("music:") || l.startsWith("media:"))) && rhythmBlocksOf(material.content).length > 0;
}

/** Practice patterns from the rhythm blocks of these materials (several blocks in one material are numbered). */
export function rhythmPatternsFromMaterials(materials: { id: string; title: string; description: string; content: string }[]): RhythmPattern[] {
  return materials.flatMap((m) => {
    const blocks = rhythmBlocksOf(m.content);
    return blocks.map((b, i) => {
      const length = Math.max(4, Math.ceil(rhythmBeats(b.pattern) / 4 - 1e-6) * 4);
      const bars = length / 4;
      return {
        id: `teacher-${m.id}-${i}`,
        name: blocks.length > 1 ? `${m.title} (${i + 1})` : m.title,
        description: m.description || rhythmToText(b.pattern),
        onset: rhythmOnsets(b.pattern),
        length,
        level: bars <= 1 ? 1 : bars <= 2 ? 2 : 3,
        glyphs: b.pattern,
        bpm: b.bpm,
        materialId: m.id,
      } satisfies RhythmPattern;
    });
  });
}
