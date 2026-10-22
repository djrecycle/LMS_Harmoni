import { cn } from "@/lib/utils";

export type NoteGlyphKind = "whole" | "half" | "quarter" | "eighth" | "rest-quarter" | "rest-eighth";

/** Small inline SVG glyph for a note value or rest sign, used in notation tables and pattern cards. */
export function NoteGlyph({ kind, className }: { kind: NoteGlyphKind; className?: string }) {
  const isRest = kind === "rest-quarter" || kind === "rest-eighth";
  return (
    <svg
      viewBox="0 0 24 32"
      className={cn("size-6", isRest ? "text-danger" : "text-foreground", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {kind === "whole" && <ellipse cx="12" cy="20" rx="6.5" ry="4.4" transform="rotate(-18 12 20)" strokeWidth={2.2} />}
      {kind === "half" && (
        <>
          <ellipse cx="9" cy="24" rx="6" ry="4.2" transform="rotate(-18 9 24)" strokeWidth={2.2} />
          <line x1="14.5" y1="22" x2="14.5" y2="4" />
        </>
      )}
      {kind === "quarter" && (
        <>
          <ellipse cx="9" cy="24" rx="6" ry="4.2" transform="rotate(-18 9 24)" fill="currentColor" />
          <line x1="14.5" y1="22" x2="14.5" y2="4" />
        </>
      )}
      {kind === "eighth" && (
        <>
          <ellipse cx="9" cy="24" rx="6" ry="4.2" transform="rotate(-18 9 24)" fill="currentColor" />
          <line x1="14.5" y1="22" x2="14.5" y2="4" />
          <path d="M14.5 4c3 1 5 3 5 6.5" fill="none" />
        </>
      )}
      {kind === "rest-quarter" && <path d="M15 3c-3 3 3 6 0 9-3 3-4 4-1 6-3 0-5 2-3 5 1.5 2 3 3 2 6l-2 3" />}
      {kind === "rest-eighth" && (
        <>
          <circle cx="8" cy="24" r="1.6" fill="currentColor" stroke="none" />
          <path d="M8 24c2-6 8-8 8-15" />
        </>
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

const GLYPH_BEATS: Record<NoteGlyphKind, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "rest-quarter": 1, "rest-eighth": 0.5 };

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
    beat += GLYPH_BEATS[g];
  }
  return <span className={cn("inline-flex flex-wrap items-end gap-0.5", className)}>{items}</span>;
}
