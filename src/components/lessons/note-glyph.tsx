import { NOTE_GLYPH_BEATS, parseGlyph } from "@/lib/music-blocks";
import { cn } from "@/lib/utils";

type NoteValue = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "thirty-second";
type Note = NoteValue | "dotted-half" | "dotted-quarter" | "dotted-eighth" | "triplet-quarter" | "triplet-eighth" | "triplet-sixteenth";
type Rest = "rest-whole" | "rest-half" | "rest-quarter" | "rest-eighth" | "rest-sixteenth" | "rest-thirty-second" | "rest-triplet-quarter" | "rest-triplet-eighth" | "rest-triplet-sixteenth";
/** A note value or rest of a rhythm (see NOTE_GLYPH_BEATS in src/lib/music-blocks.ts for their lengths). */
export type NoteGlyphKind = Note | Rest;

const FLAGS: Record<string, number> = { eighth: 1, sixteenth: 2, "thirty-second": 3 };

/**
 * Small inline SVG glyph for a note value or rest sign, used in notation tables and pattern cards.
 *  Dotted values get a dot, triplets a small "3".
 */
export function NoteGlyph({ kind, className }: { kind: NoteGlyphKind; className?: string }) {
  const { rest, value, dotted, triplet } = parseGlyph(kind);
  const flags = FLAGS[value] ?? 0;
  return (
    <svg
      viewBox="0 0 24 32"
      className={cn("size-6", rest ? "text-danger" : "text-foreground", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {!rest && value === "whole" && <ellipse cx="12" cy="20" rx="6.5" ry="4.4" transform="rotate(-18 12 20)" strokeWidth={2.2} />}
      {!rest && value !== "whole" && (
        <>
          {value === "half" ? (
            <ellipse cx="9" cy="24" rx="6" ry="4.2" transform="rotate(-18 9 24)" strokeWidth={2.2} />
          ) : (
            <ellipse cx="9" cy="24" rx="6" ry="4.2" transform="rotate(-18 9 24)" fill="currentColor" />
          )}
          <line x1="14.5" y1="22" x2="14.5" y2="4" />
          {Array.from({ length: flags }, (_, i) => (
            <path key={i} d={`M14.5 ${4 + i * 4}c3 1 5 3 5 6.5`} fill="none" />
          ))}
        </>
      )}
      {rest && value === "whole" && (
        <>
          <line x1="5" y1="12" x2="19" y2="12" />
          <rect x="8" y="12" width="8" height="4" fill="currentColor" stroke="none" />
        </>
      )}
      {rest && value === "half" && (
        <>
          <line x1="5" y1="18" x2="19" y2="18" />
          <rect x="8" y="14" width="8" height="4" fill="currentColor" stroke="none" />
        </>
      )}
      {rest && value === "quarter" && <path d="M15 3c-3 3 3 6 0 9-3 3-4 4-1 6-3 0-5 2-3 5 1.5 2 3 3 2 6l-2 3" />}
      {rest && flags > 0 && (
        <>
          <path d="M9 28L15.5 7" />
          {Array.from({ length: flags }, (_, i) => (
            <g key={i}>
              <circle cx={8 - i * 1.4} cy={9 + i * 6} r="1.6" fill="currentColor" stroke="none" />
              <path d={`M${8 - i * 1.4} ${9 + i * 6}c2 1.5 5 1 ${7.5 - i * 0.6} -2`} />
            </g>
          ))}
        </>
      )}
      {dotted && <circle cx={value === "whole" ? 21 : 19} cy="24" r="1.7" fill="currentColor" stroke="none" />}
      {triplet && (
        <text x="3" y="9" fontSize="9" fontWeight="bold" fill="currentColor" stroke="none">
          3
        </text>
      )}
    </svg>
  );
}

/** Two eighth notes joined by a beam, as in printed music. Same note size and spacing as two NoteGlyphs. */
export function BeamedEighths({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 32" className={cn("h-6 w-auto text-foreground", className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <ellipse cx="9" cy="24" rx="6" ry="4.2" transform="rotate(-18 9 24)" fill="currentColor" />
      <ellipse cx="31" cy="24" rx="6" ry="4.2" transform="rotate(-18 31 24)" fill="currentColor" />
      <line x1="14.5" y1="22" x2="14.5" y2="5" />
      <line x1="36.5" y1="22" x2="36.5" y2="5" />
      <path d="M14.5 3.2H36.5V6.6H14.5Z" fill="currentColor" strokeWidth={0.6} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A rhythm in a row, drawn like a score: two eighth notes that share one beat are beamed together.
 *  `size` is the note height class pair: "md" = 28px (h-7), "lg" = 32px (h-8).
 */
export function RhythmNotation({ pattern, size = "md", className }: { pattern: NoteGlyphKind[]; size?: "md" | "lg"; className?: string }) {
  const single = size === "lg" ? "size-8" : "size-7";
  const pair = size === "lg" ? "h-8" : "h-7";
  const items: React.ReactNode[] = [];
  let beat = 0;
  for (let i = 0; i < pattern.length; i++) {
    const g = pattern[i];
    if (g === "eighth" && pattern[i + 1] === "eighth" && beat % 1 === 0) {
      items.push(<BeamedEighths key={i} className={pair} />);
      beat += 1;
      i++;
      continue;
    }
    items.push(<NoteGlyph key={i} kind={g} className={single} />);
    beat += NOTE_GLYPH_BEATS[g];
  }
  return <span className={cn("inline-flex flex-wrap items-end gap-0.5", className)}>{items}</span>;
}
