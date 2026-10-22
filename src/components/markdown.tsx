import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RhythmNotation } from "@/components/lessons/note-glyph";
import { MediaPlayer } from "@/components/media-player";
import { PianoRoll } from "@/components/piano-roll";
import { StaffNotation } from "@/components/staff-notation";
import { decodeFence, isMusicFenceLang, type DecodedMusicBlock } from "@/lib/music-blocks";
import { cn } from "@/lib/utils";

/** Renders a decoded music fence block (see src/lib/music-blocks.ts) as a real widget instead of a code block. */
function MusicBlock({ block }: { block: DecodedMusicBlock }) {
  switch (block.lang) {
    case "media:audio":
    case "media:video":
      return (
        <div className="not-prose my-3 rounded-lg border bg-card p-3">
          {block.title && <p className="mb-2 text-sm font-semibold">{block.title}</p>}
          <MediaPlayer kind={block.kind} mediaKey={block.key} title={block.title} />
        </div>
      );
    case "music:rhythm":
      return (
        <div className="not-prose my-3 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          {block.pattern.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <RhythmNotation pattern={block.pattern} size="lg" />
          )}
        </div>
      );
    case "music:melody":
      return (
        <div className="not-prose my-3 grid gap-3 rounded-lg border bg-card p-3">
          <PianoRoll length={block.length} notes={block.notes} />
          <StaffNotation length={block.length} notes={block.notes} />
        </div>
      );
    case "music:chords":
      return (
        <div className="not-prose my-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <span className="text-sm font-semibold">{block.label ?? "Chord / Not"}:</span>
          {block.items.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            block.items.map((item, i) => (
              <span key={i} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold">
                {item}
              </span>
            ))
          )}
        </div>
      );
  }
}

/** Render Markdown safely (raw HTML is not processed). Music fence blocks (see music-blocks.ts) render as real widgets. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-materi", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // A wide table scrolls sideways on its own instead of stretching the page on phones.
          table: ({ children }) => (
            <div className="overflow-x-auto [contain:inline-size]">
              <table>{children}</table>
            </div>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className: codeClassName, children }) => {
            const lang = /language-([\w:.-]+)/.exec(codeClassName ?? "")?.[1];
            if (lang && isMusicFenceLang(lang)) {
              const decoded = decodeFence(lang, String(children).replace(/\n$/, ""));
              if (decoded) return <MusicBlock block={decoded} />;
            }
            if (lang) {
              return (
                <pre className="overflow-x-auto rounded-lg bg-muted p-3">
                  <code className={codeClassName}>{children}</code>
                </pre>
              );
            }
            return <code className={codeClassName}>{children}</code>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
