"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bold, Circle, Eye, EyeOff, GripVertical, Guitar, Hand, Heading2, Italic, Link2, List, ListOrdered, Minus, Music2, Piano as PianoIcon, Pilcrow, Play, Plus, Square, Table2, Trash2, Undo2, Video as VideoIcon, Volume2, X } from "lucide-react";
import { emptyBlock, parseToBlocks, retemplateRaw, serializeBlocks, type AddKind, type EditorBlock, type RawKind } from "@/lib/block-editor";
import { NoteGlyph, type NoteGlyphKind } from "@/components/lessons/note-glyph";
import { MediaPlayer } from "@/components/media-player";
import { MediaUploader } from "@/components/media-uploader";
import { listSongsForBlocks, type BlockSongOption } from "@/app/actions/piano-song";
import {
  activeEvent,
  ChordChipRow,
  chordEvents,
  chordSounds,
  CountIn,
  MeterSelect,
  MetronomeButton,
  VoiceSelect,
  rhythmEvents,
  rhythmOnsetBeats,
  TempoControl,
  useTransport,
} from "@/components/lessons/music-block-players";
import { Piano } from "@/components/piano";
import { ScoreView, totalBeats } from "@/components/score-view";
import { SongPianoRoll } from "@/components/song-piano-roll";
import { SongPlayer } from "@/components/song-player";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { audioTime, playChord, scheduleClick } from "@/lib/audio";
import { chordNameOf, chordMidis, midiToNote, NOTE_NAMES, noteToMidi } from "@/lib/music";
import { barBeats, CHORD_LENGTHS, glyphLabel, tripletProblem } from "@/lib/music-blocks";
import { onsetsToPattern } from "@/lib/rhythm";
import { detectDoMidi, parseSongNotation, SONGS, type Song } from "@/lib/songs";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const RAW_KIND_LABEL: Record<RawKind, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  "bullet-list": "Bullet list",
  "numbered-list": "Numbered list",
  table: "Table",
  hr: "Divider",
  other: "Content",
};

const SWITCHABLE_KINDS: RawKind[] = ["heading", "paragraph", "bullet-list", "numbered-list"];

/** The rhythm palette: every note value, rest and triplet a rhythm block can hold. */
const RHYTHM_PALETTE: { label: string; kinds: NoteGlyphKind[] }[] = [
  { label: "Note values", kinds: ["whole", "dotted-half", "half", "dotted-quarter", "quarter", "dotted-eighth", "eighth", "sixteenth", "thirty-second"] },
  { label: "Rests", kinds: ["rest-whole", "rest-half", "rest-quarter", "rest-eighth", "rest-sixteenth", "rest-thirty-second"] },
  { label: "Triplets", kinds: ["triplet-quarter", "triplet-eighth", "triplet-sixteenth", "rest-triplet-quarter", "rest-triplet-eighth", "rest-triplet-sixteenth"] },
];
/** One click adds a whole triplet group (three notes in the time of two). */
const TRIPLET_GROUPS: { kind: NoteGlyphKind; label: string }[] = [
  { kind: "triplet-quarter", label: "1/4" },
  { kind: "triplet-eighth", label: "1/8" },
  { kind: "triplet-sixteenth", label: "1/16" },
];

const ADD_BUTTONS: { kind: AddKind; label: string; icon: typeof Heading2 }[] = [
  { kind: "heading", label: "Heading", icon: Heading2 },
  { kind: "paragraph", label: "Paragraph", icon: Pilcrow },
  { kind: "bullet-list", label: "Bullet list", icon: List },
  { kind: "numbered-list", label: "Numbered list", icon: ListOrdered },
  { kind: "table", label: "Table", icon: Table2 },
  { kind: "hr", label: "Divider", icon: Minus },
  { kind: "audio", label: "Audio clip", icon: Volume2 },
  { kind: "video", label: "Video", icon: VideoIcon },
];

/** The "Piano" button offers these three music blocks. */
const PIANO_CHOICES: { kind: AddKind; label: string; hint: string; icon: typeof Heading2 }[] = [
  { kind: "song", label: "Melody", hint: "Piano roll like FL Studio: write or record a song", icon: PianoIcon },
  { kind: "chords", label: "Chords", hint: "Chord progression on the staff, written or played on the piano", icon: Guitar },
  { kind: "rhythm", label: "Rhythm pattern", hint: "Rhythm on the staff, written or tapped along with the metronome", icon: Music2 },
];

const CHORD_QUALITIES: [string, string][] = [
  ["", "major"],
  ["m", "minor"],
  ["7", "7"],
  ["maj7", "maj7"],
  ["m7", "m7"],
  ["dim", "dim"],
  ["aug", "aug"],
  ["sus2", "sus2"],
  ["sus4", "sus4"],
  ["6", "6"],
];
/** How many bars a recording by tapping lasts at most. */
const RECORD_BARS = 4;

/** The key's "do" choices, as in the piano song form. */
const DO_NOTES = ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A3", "A#3", "B3"];

function headingText(markdown: string): string {
  return markdown.replace(/^#{1,6}\s*/, "");
}

/** Inserts formatting markup around the current selection in a textarea, like the old top-level toolbar did, but scoped to one block. */
function useInsert(ref: React.RefObject<HTMLTextAreaElement | null>, value: string, onChange: (v: string) => void) {
  return (prefix: string, suffix = "", placeholder = "text") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const selected = value.slice(a, b) || placeholder;
    const next = value.slice(0, a) + prefix + selected + suffix + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + prefix.length, a + prefix.length + selected.length);
    });
  };
}

function CardChrome({
  id,
  label,
  onDelete,
  children,
}: {
  id: string;
  label: string;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg border bg-card p-3", isDragging && "opacity-60 shadow-lg")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={t("Drag to reorder")}
            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            suppressHydrationWarning
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        </div>
        <Button type="button" size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-danger" aria-label={t("Delete block")} onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {children}
    </div>
  );
}

function RawCard({ block, onChange, onDelete }: { block: Extract<EditorBlock, { type: "raw" }>; onChange: (b: EditorBlock) => void; onDelete: () => void }) {
  const t = useT();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const insert = useInsert(areaRef, block.markdown, (markdown) => onChange({ ...block, markdown }));
  const switchable = SWITCHABLE_KINDS.includes(block.kind);

  return (
    <CardChrome id={block.id} label={t(RAW_KIND_LABEL[block.kind])} onDelete={onDelete}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {switchable ? (
          <Select
            className="h-8 w-auto text-xs"
            value={block.kind}
            onChange={(ev) => onChange(retemplateRaw(block, ev.target.value as RawKind, block.kind === "heading" ? block.depth : 2))}
          >
            {SWITCHABLE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(RAW_KIND_LABEL[k])}
              </option>
            ))}
          </Select>
        ) : null}
        {block.kind === "heading" && (
          <Select className="h-8 w-auto text-xs" value={String(block.depth ?? 2)} onChange={(ev) => onChange({ ...block, depth: Number(ev.target.value), markdown: `${"#".repeat(Number(ev.target.value))} ${headingText(block.markdown)}` })}>
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                H{d}
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-7" aria-label={t("Bold")} onClick={() => insert("**", "**")}>
            <Bold className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label={t("Italic")} onClick={() => insert("*", "*")}>
            <Italic className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label={t("Link")} onClick={() => insert("[", "](https://)", t("link text"))}>
            <Link2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {block.kind === "heading" ? (
        <Input value={headingText(block.markdown)} onChange={(ev) => onChange({ ...block, markdown: `${"#".repeat(block.depth ?? 2)} ${ev.target.value}` })} placeholder={t("Section heading")} />
      ) : (
        <Textarea
          ref={areaRef}
          value={block.markdown}
          onChange={(ev) => onChange({ ...block, markdown: ev.target.value })}
          rows={Math.min(12, Math.max(2, block.markdown.split("\n").length))}
          className="font-mono text-[0.9rem]"
          placeholder={block.kind === "paragraph" ? t("Write here…") : undefined}
        />
      )}
    </CardChrome>
  );
}

function MediaCard({ block, onChange, onDelete }: { block: Extract<EditorBlock, { type: "media" }>; onChange: (b: EditorBlock) => void; onDelete: () => void }) {
  const t = useT();
  return (
    <CardChrome id={block.id} label={t(block.kind === "audio" ? "Audio clip" : "Video")} onDelete={onDelete}>
      <div className="grid gap-2">
        <Input value={block.title} onChange={(ev) => onChange({ ...block, title: ev.target.value })} placeholder={t("Title (optional)")} />
        <MediaUploader name={`block-media-${block.id}`} kind={block.kind} defaultValue={block.key || null} onChange={(key) => onChange({ ...block, key })} />
        {block.key && <MediaPlayer kind={block.kind} mediaKey={block.key} title={block.title} />}
      </div>
    </CardChrome>
  );
}

function RhythmCard({ block, onChange, onDelete }: { block: Extract<EditorBlock, { type: "rhythm" }>; onChange: (b: EditorBlock) => void; onDelete: () => void }) {
  const t = useT();
  const tr = useTransport();
  const [metronome, setMetronome] = useState(true);
  const [recording, setRecording] = useState(false);
  const [undoPattern, setUndoPattern] = useState<NoteGlyphKind[] | null>(null);
  // How finely taps snap when recording: eighths (forgiving) or sixteenths (detailed rhythms).
  const [grid, setGrid] = useState<0.5 | 0.25>(0.5);
  const [tapFlash, setTapFlash] = useState(false);
  const taps = useRef<number[]>([]);
  const events = useMemo(() => rhythmEvents(block.pattern), [block.pattern]);

  function play() {
    void tr.start({
      bpm: block.bpm,
      meter: block.meter,
      countIn: 1,
      total: totalBeats(events),
      metronome,
      sounds: rhythmOnsetBeats(block.pattern).map((o) => ({ beat: o, play: (time: number) => scheduleClick(time, true, block.voice) })),
    });
  }

  /** Recording: after a one-bar count-in the teacher taps the rhythm with the metronome; taps become the pattern. */
  function record() {
    taps.current = [];
    setRecording(true);
    void tr.start({ bpm: block.bpm, meter: block.meter, countIn: 1, total: RECORD_BARS * barBeats(block.meter), metronome: true, sounds: [], onEnd: (r) => finishRecording(r) });
  }
  function finishRecording(r: { t0: number; spb: number } | null) {
    setRecording(false);
    if (!r || !taps.current.length) return;
    const bar = barBeats(block.meter);
    const pattern = onsetsToPattern(
      taps.current.map((tap) => (tap - r.t0) / r.spb).filter((b) => b > -0.25 && b < RECORD_BARS * bar),
      bar,
      grid,
    );
    if (!pattern.length) return;
    setUndoPattern(block.pattern);
    onChange({ ...block, pattern });
  }
  function stopRecording() {
    const r = tr.current();
    tr.stop();
    finishRecording(r);
  }
  function tap() {
    if (!recording) return;
    taps.current.push(audioTime());
    scheduleClick(audioTime() + 0.005, true, block.voice);
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 120);
  }

  return (
    <CardChrome id={block.id} label={t("Rhythm pattern")} onDelete={onDelete}>
      <div
        className="grid gap-3 outline-none"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (recording && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            tap();
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => (tr.playing && !recording ? tr.stop() : play())} disabled={recording || !block.pattern.length}>
            {tr.playing && !recording ? <Square /> : <Play />} {tr.playing && !recording ? t("Stop") : t("Play")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => (recording ? stopRecording() : record())}
            disabled={tr.playing && !recording}
            className={cn("border-danger/60 text-danger", recording && "animate-pulse bg-danger text-white")}
            title={t("Tap the rhythm along with the metronome after a one-bar count-in")}
          >
            <Circle className="fill-current" /> {recording ? t("Stop recording") : t("Record by tapping")}
          </Button>
          <TempoControl bpm={block.bpm} onChange={(bpm) => onChange({ ...block, bpm })} disabled={tr.playing} />
          <MetronomeButton on={metronome} onChange={setMetronome} disabled={tr.playing} />
          <MeterSelect value={block.meter} onChange={(meter) => onChange({ ...block, meter })} disabled={tr.playing} />
          <VoiceSelect value={block.voice} onChange={(voice) => onChange({ ...block, voice })} disabled={tr.playing} />
          <label className="inline-flex items-center gap-1.5 text-sm font-semibold" title={t("How finely the taps are written when recording")}>
            {t("Recording detail")}
            <select value={grid} disabled={tr.playing} onChange={(e) => setGrid(Number(e.target.value) as 0.5 | 0.25)} className="h-9 rounded-lg border bg-card px-2 text-sm">
              <option value={0.5}>1/8</option>
              <option value={0.25}>1/16</option>
            </select>
          </label>
          <CountIn beat={tr.beat} meter={block.meter} />
          {undoPattern && !recording && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange({ ...block, pattern: undoPattern });
                setUndoPattern(null);
              }}
            >
              <Undo2 /> {t("Undo recording")}
            </Button>
          )}
        </div>
        {recording && (
          <Button
            type="button"
            variant="outline"
            className={cn("h-14 text-base", tapFlash && "border-primary bg-primary-soft")}
            onPointerDown={(e) => {
              e.preventDefault();
              tap();
            }}
          >
            <Hand /> {t("Tap here (or Space) — up to 4 bars")}
          </Button>
        )}
        {tripletProblem(block.pattern, barBeats(block.meter)) && (
          <Alert kind="warning">
            {tripletProblem(block.pattern, barBeats(block.meter)) === "incomplete"
              ? t("A triplet group needs three notes or rests of the same value.")
              : t("A triplet group crosses a bar line; move it so it fits inside one bar.")}
          </Alert>
        )}
        <ScoreView events={events} clef="rhythm" meter={block.meter} cursorBeat={tr.beat !== null && tr.beat >= 0 ? tr.beat : null} />
        <div className="grid gap-1.5">
          {RHYTHM_PALETTE.map((row) => (
            <div key={row.label} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">{t(row.label)}</span>
              {row.kinds.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 px-2.5"
                  title={t(glyphLabel(kind))}
                  aria-label={t(glyphLabel(kind))}
                  onClick={() => onChange({ ...block, pattern: [...block.pattern, kind] })}
                >
                  <NoteGlyph kind={kind} className="size-5" />
                </Button>
              ))}
              {row.label === "Triplets" &&
                TRIPLET_GROUPS.map((g) => (
                  <Button
                    key={g.kind}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9"
                    title={t("Adds a whole triplet group: three notes in the time of two")}
                    onClick={() => onChange({ ...block, pattern: [...block.pattern, g.kind, g.kind, g.kind] })}
                  >
                    <NoteGlyph kind={g.kind} className="size-5" /> {t("{0} triplet ×3", g.label)}
                  </Button>
                ))}
            </div>
          ))}
        </div>
        <div className="flex min-h-14 flex-wrap items-end gap-2 rounded-lg border border-dashed p-2">
          {block.pattern.length === 0 ? (
            <span className="self-center text-sm text-muted-foreground">{t("Tap a note or rest above, or record by tapping.")}</span>
          ) : (
            block.pattern.map((kind, i) => (
              <button
                key={i}
                type="button"
                aria-label={t("Remove")}
                className="group relative rounded-md border bg-card p-1.5 hover:border-danger"
                onClick={() => onChange({ ...block, pattern: block.pattern.filter((_, j) => j !== i) })}
              >
                <NoteGlyph kind={kind} className="size-6" />
                <X className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-danger text-white opacity-0 group-hover:opacity-100" />
              </button>
            ))
          )}
        </div>
      </div>
    </CardChrome>
  );
}

function ChordsCard({ block, onChange, onDelete }: { block: Extract<EditorBlock, { type: "chords" }>; onChange: (b: EditorBlock) => void; onDelete: () => void }) {
  const t = useT();
  const tr = useTransport();
  const [draft, setDraft] = useState("");
  const [root, setRoot] = useState("C");
  const [quality, setQuality] = useState("");
  const [length, setLength] = useState<number>(barBeats(block.meter));
  const [metronome, setMetronome] = useState(true);
  const [fromPiano, setFromPiano] = useState(false);
  const held = useRef(new Set<number>());
  const played = useRef(new Set<number>());
  const events = useMemo(() => chordEvents(block.items, block.beats), [block.items, block.beats]);

  const add = (item: string) => {
    const v = item.trim();
    if (!v) return;
    onChange({ ...block, items: [...block.items, v], beats: [...block.beats, length] });
  };
  const remove = (i: number) => onChange({ ...block, items: block.items.filter((_, j) => j !== i), beats: block.beats.filter((_, j) => j !== i) });
  const setBeats = (i: number, beats: number) => onChange({ ...block, beats: block.beats.map((b, j) => (j === i ? beats : b)) });

  // Playing on the piano: the keys held together become one chord when the last one is released.
  const onPress = (midi: number) => {
    held.current.add(midi);
    played.current.add(midi);
  };
  const onRelease = (midi: number) => {
    held.current.delete(midi);
    if (held.current.size || !played.current.size) return;
    const midis = [...played.current].sort((a, b) => a - b);
    played.current = new Set();
    add(chordNameOf(midis) ?? midis.map(midiToNote).join(" "));
  };

  return (
    <CardChrome id={block.id} label={t("Chords")} onDelete={onDelete}>
      <div className="grid gap-3">
        <Input value={block.label} onChange={(ev) => onChange({ ...block, label: ev.target.value })} placeholder={t("Label, e.g. Chords used")} />

        {/* Build a chord: root + type + length. */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            {t("Root")}
            <Select className="h-9 w-auto" value={root} onChange={(ev) => setRoot(ev.target.value)}>
              {NOTE_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            {t("Type")}
            <Select className="h-9 w-auto" value={quality} onChange={(ev) => setQuality(ev.target.value)}>
              {CHORD_QUALITIES.map(([q, name]) => (
                <option key={q} value={q}>
                  {root}
                  {q} ({t(name)})
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            {t("Length")}
            <Select className="h-9 w-auto" value={length} onChange={(ev) => setLength(Number(ev.target.value))}>
              {CHORD_LENGTHS.map((b) => (
                <option key={b} value={b}>
                  {b === barBeats(block.meter) ? t("{0} beats (1 bar)", b) : t("{0} beats", b)}
                </option>
              ))}
            </Select>
          </label>
          <MeterSelect
            value={block.meter}
            onChange={(meter) => {
              onChange({ ...block, meter });
              setLength(barBeats(meter));
            }}
            disabled={tr.playing}
          />
          <Button type="button" size="sm" variant="secondary" className="h-9" onClick={() => add(root + quality)}>
            <Plus /> {t("Add chord")}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => playChordNow(root + quality)}>
            <Volume2 /> {t("Listen")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={fromPiano ? "secondary" : "outline"} aria-pressed={fromPiano} onClick={() => setFromPiano((x) => !x)}>
            <PianoIcon /> {fromPiano ? t("Hide piano") : t("Record from the piano")}
          </Button>
          <input
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === ",") {
                ev.preventDefault();
                add(draft);
                setDraft("");
              }
            }}
            placeholder={t("…or type a chord or notes (C4 E4 G4), Enter to add")}
            className="h-9 min-w-48 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-primary"
          />
        </div>
        {fromPiano && (
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">{t("Press the chord's keys together; when you let go it is added with the chosen length.")}</p>
            <Piano onNotePress={onPress} onNoteRelease={onRelease} />
          </div>
        )}

        {/* The progression: click a name to hear it, change its length, or remove it. */}
        {block.items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border p-2">
            {block.items.map((item, i) => (
              <span key={i} className={cn("inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pr-1 pl-2.5 text-xs font-semibold", activeEvent(events, tr.beat) === i && "bg-primary text-primary-foreground")}>
                <button type="button" onClick={() => playChordNow(item)} title={t("Click to hear it")}>
                  {item}
                </button>
                <select
                  value={block.beats[i] ?? 4}
                  onChange={(ev) => setBeats(i, Number(ev.target.value))}
                  aria-label={t("Length")}
                  className="rounded bg-transparent text-[0.7rem] outline-none"
                >
                  {CHORD_LENGTHS.map((b) => (
                    <option key={b} value={b}>
                      {b}♩
                    </option>
                  ))}
                </select>
                <button type="button" aria-label={t("Remove")} onClick={() => remove(i)}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {block.items.length > 0 && (
          <>
            <ScoreView events={events} meter={block.meter} cursorBeat={tr.beat !== null && tr.beat >= 0 ? tr.beat : null} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  tr.playing
                    ? tr.stop()
                    : void tr.start({ bpm: block.bpm, meter: block.meter, countIn: metronome ? 1 : 0, total: totalBeats(events), metronome, sounds: chordSounds(events) })
                }
              >
                {tr.playing ? <Square /> : <Play />} {tr.playing ? t("Stop") : t("Play")}
              </Button>
              <TempoControl bpm={block.bpm} onChange={(bpm) => onChange({ ...block, bpm })} disabled={tr.playing} />
              <MetronomeButton on={metronome} onChange={setMetronome} disabled={tr.playing} />
              <CountIn beat={tr.beat} meter={block.meter} />
            </div>
          </>
        )}
      </div>
    </CardChrome>
  );
}

function playChordNow(item: string) {
  const midis = chordMidis(item);
  if (midis) playChord(midis);
}

/**
 * "Lagu Piano" block: the teacher writes (or records) a song in the FL Studio-style piano roll, or copies one
 *  from the Piano Songs menu. Students get the full song player (falling notes, notasi angka, staff, tempo, metronome).
 */
function SongCard({ block, onChange, onDelete }: { block: Extract<EditorBlock, { type: "song" }>; onChange: (b: EditorBlock) => void; onDelete: () => void }) {
  const t = useT();
  const [rollKey, setRollKey] = useState(0);
  const [mine, setMine] = useState<BlockSongOption[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [preview, setPreview] = useState(false);

  const loadMine = () => {
    if (mine || loading) return;
    startLoading(async () => setMine(await listSongsForBlocks().catch(() => [])));
  };

  /** Copies a song into this block (it can then be changed here without touching the original). */
  function copy(value: string) {
    const [src, id] = value.split(":");
    let picked: { title: string; bpm: number; doNote: string; notes: Song["notes"] } | null = null;
    if (src === "mine") {
      const o = mine?.find((x) => x.id === id);
      const r = o ? parseSongNotation("roll", o.roll) : null;
      if (o && r?.ok) picked = { title: o.title, bpm: o.bpm, doNote: o.doNote, notes: r.notes };
    } else {
      const o = SONGS.find((x) => x.id === id);
      if (o) picked = { title: t(o.title), bpm: o.bpm, doNote: midiToNote(o.doMidi ?? detectDoMidi(o.notes)), notes: o.notes };
    }
    if (!picked) return;
    onChange({ ...block, title: block.title.trim() || picked.title, bpm: picked.bpm, doNote: DO_NOTES.includes(picked.doNote) ? picked.doNote : "C4", notes: picked.notes });
    setRollKey((k) => k + 1);
  }

  const song = useMemo<Song>(
    () => ({ id: `block-${block.id}`, title: "", level: 1, bpm: block.bpm, notes: block.notes, doMidi: noteToMidi(block.doNote) ?? 60 }),
    [block.id, block.bpm, block.notes, block.doNote],
  );

  return (
    <CardChrome id={block.id} label={t("Piano song")} onDelete={onDelete}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={block.title} onChange={(ev) => onChange({ ...block, title: ev.target.value })} placeholder={t("Song title (optional)")} className="min-w-48 flex-1" />
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            {t("Key: do =")}
            <Select className="h-10 w-auto" value={block.doNote} onChange={(ev) => onChange({ ...block, doNote: ev.target.value })}>
              {DO_NOTES.map((n) => (
                <option key={n} value={n}>
                  {n.replace(/\d/, "")}
                </option>
              ))}
            </Select>
          </label>
          <Select className="h-10 w-auto" value="" onFocus={loadMine} onPointerDown={loadMine} onChange={(ev) => copy(ev.target.value)} aria-label={t("Copy from Piano Songs")}>
            <option value="">{loading ? t("Loading…") : t("Copy from Piano Songs…")}</option>
            {mine && mine.length > 0 && (
              <optgroup label={t("My piano songs")}>
                {mine.map((o) => (
                  <option key={o.id} value={`mine:${o.id}`}>
                    {o.title}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={t("Practice songs")}>
              {SONGS.map((o) => (
                <option key={o.id} value={`builtin:${o.id}`}>
                  {t(o.title)}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <SongPianoRoll
          key={rollKey}
          initial={block.notes}
          bpm={block.bpm}
          onBpmChange={(bpm) => onChange({ ...block, bpm })}
          title={block.title}
          onChange={(notes) => onChange({ ...block, notes })}
        />
        {block.notes.length > 0 && (
          <div className="grid gap-2">
            <div>
              <Button type="button" size="sm" variant="outline" onClick={() => setPreview((x) => !x)}>
                {preview ? <EyeOff /> : <Eye />} {preview ? t("Close student view") : t("Try it as a student")}
              </Button>
            </div>
            {preview && <SongPlayer songs={[song]} saveScores={false} computerKeys={false} />}
          </div>
        )}
      </div>
    </CardChrome>
  );
}

/**
 * Drag-and-drop block editor over Markdown: parses `value` into blocks, lets the teacher add/reorder/
 * edit/delete them (including the music-specific blocks), and calls `onChange` with the re-serialized
 * Markdown on every edit. See src/lib/block-editor.ts for the parse/serialize logic.
 */
export function BlockEditor({ value, onChange }: { value: string; onChange: (markdown: string) => void }) {
  const t = useT();
  const lastEmitted = useRef<string | null>(null);
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => parseToBlocks(value));
  const [pianoMenu, setPianoMenu] = useState(false);

  useEffect(() => {
    if (value !== lastEmitted.current) setBlocks(parseToBlocks(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(next: EditorBlock[]) {
    setBlocks(next);
    const markdown = serializeBlocks(next);
    lastEmitted.current = markdown;
    onChange(markdown);
  }

  const updateBlock = (id: string, next: EditorBlock) => commit(blocks.map((b) => (b.id === id ? next : b)));
  const removeBlock = (id: string) => commit(blocks.filter((b) => b.id !== id));
  const addBlock = (kind: AddKind) => commit([...blocks, emptyBlock(kind)]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from === -1 || to === -1) return;
    commit(arrayMove(blocks, from, to));
  }

  return (
    <div className="grid gap-3">
      <DndContext id="lesson-content-blocks" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-3">
            {blocks.map((b) => {
              if (b.type === "raw") return <RawCard key={b.id} block={b} onChange={(next) => updateBlock(b.id, next)} onDelete={() => removeBlock(b.id)} />;
              if (b.type === "media") return <MediaCard key={b.id} block={b} onChange={(next) => updateBlock(b.id, next)} onDelete={() => removeBlock(b.id)} />;
              if (b.type === "rhythm") return <RhythmCard key={b.id} block={b} onChange={(next) => updateBlock(b.id, next)} onDelete={() => removeBlock(b.id)} />;
              if (b.type === "chords") return <ChordsCard key={b.id} block={b} onChange={(next) => updateBlock(b.id, next)} onDelete={() => removeBlock(b.id)} />;
              return <SongCard key={b.id} block={b} onChange={(next) => updateBlock(b.id, next)} onDelete={() => removeBlock(b.id)} />;
            })}
          </div>
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("No content yet. Add a block below.")}</p>}

      <div className="grid gap-2 border-t pt-3">
        <div className="flex flex-wrap gap-1.5">
          {ADD_BUTTONS.map(({ kind, label, icon: Icon }) => (
            <Button key={kind} type="button" size="sm" variant="outline" onClick={() => addBlock(kind)}>
              <Icon className="size-4" />
              {t(label)}
            </Button>
          ))}
          <Button type="button" size="sm" variant={pianoMenu ? "secondary" : "outline"} aria-expanded={pianoMenu} onClick={() => setPianoMenu((x) => !x)}>
            <PianoIcon className="size-4" />
            {t("Piano")}
          </Button>
        </div>
        {pianoMenu && (
          <div className="grid gap-2 rounded-lg border bg-muted/40 p-2 sm:grid-cols-3">
            {PIANO_CHOICES.map(({ kind, label, hint, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  addBlock(kind);
                  setPianoMenu(false);
                }}
                className="grid gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/40"
              >
                <span className="inline-flex items-center gap-2 font-semibold">
                  <Icon className="size-4 text-primary" /> {t(label)}
                </span>
                <span className="text-xs text-muted-foreground">{t(hint)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
