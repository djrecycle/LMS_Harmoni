import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChordBlockPlayer, RhythmBlockPlayer, SongBlockPlayer } from "@/components/lessons/music-block-players";
import { MediaPlayer } from "@/components/media-player";
import { noteToMidi } from "@/lib/music";
import { decodeFence, isMusicFenceLang, MELODY_BLOCK_BPM, melodyToSongNotes, type DecodedMusicBlock } from "@/lib/music-blocks";
import { parseSongNotation } from "@/lib/songs";
import { cn } from "@/lib/utils";

/** A short, stable id for a block's content (the song player keys its state on it). */
function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

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
        <div className="not-prose my-3 rounded-lg border bg-card p-3">
          <RhythmBlockPlayer pattern={block.pattern} bpm={block.bpm} meter={block.meter} voice={block.voice} />
        </div>
      );
    case "music:melody":
      // Old Melody blocks play in the song player, like the "Lagu Piano" block that replaced them.
      return (
        <div className="not-prose my-3 rounded-lg border bg-card p-3">
          <SongBlockPlayer id={`melody-${hash(JSON.stringify(block.notes))}`} bpm={MELODY_BLOCK_BPM} notes={melodyToSongNotes(block)} />
        </div>
      );
    case "music:song": {
      const r = parseSongNotation("roll", block.roll);
      return (
        <div className="not-prose my-3 rounded-lg border bg-card p-3">
          <SongBlockPlayer
            id={`song-${hash(block.roll)}`}
            title={block.title}
            bpm={block.bpm}
            doMidi={block.doNote ? (noteToMidi(block.doNote) ?? undefined) : undefined}
            notes={r.ok ? r.notes : []}
          />
        </div>
      );
    }
    case "music:chords":
      return (
        <div className="not-prose my-3 rounded-lg border bg-card p-3">
          <ChordBlockPlayer label={block.label} items={block.items} beats={block.beats} bpm={block.bpm} meter={block.meter} />
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
