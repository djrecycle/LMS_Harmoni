"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bold, GripVertical, Guitar, Heading2, Italic, Link2, List, ListOrdered, Minus, Music2, Piano as PianoIcon, Pilcrow, Table2, Trash2, Video as VideoIcon, Volume2, X } from "lucide-react";
import { emptyBlock, parseToBlocks, retemplateRaw, serializeBlocks, type AddKind, type EditorBlock, type RawKind } from "@/lib/block-editor";
import { NoteGlyph, type NoteGlyphKind } from "@/components/lessons/note-glyph";
import { MediaPlayer } from "@/components/media-player";
import { MediaUploader } from "@/components/media-uploader";
import { PianoRoll } from "@/components/piano-roll";
import { StaffNotation } from "@/components/staff-notation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { MELODY_UNITS_PER_BAR } from "@/lib/music-blocks";
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

const NOTE_PALETTE: NoteGlyphKind[] = ["whole", "half", "quarter", "eighth", "rest-quarter", "rest-eighth"];

const ADD_BUTTONS: { kind: AddKind; label: string; icon: typeof Heading2 }[] = [
  { kind: "heading", label: "Heading", icon: Heading2 },
  { kind: "paragraph", label: "Paragraph", icon: Pilcrow },
  { kind: "bullet-list", label: "Bullet list", icon: List },
  { kind: "numbered-list", label: "Numbered list", icon: ListOrdered },
  { kind: "table", label: "Table", icon: Table2 },
  { kind: "hr", label: "Divider", icon: Minus },
  { kind: "audio", label: "Audio clip", icon: Volume2 },
  { kind: "video", label: "Video", icon: VideoIcon },
  { kind: "rhythm", label: "Rhythm pattern", icon: Music2 },
  { kind: "chords", label: "Chords / notes", icon: Guitar },
  { kind: "melody", label: "Melody (piano roll)", icon: PianoIcon },
];

const BAR_COUNTS = [1, 2, 4] as const;

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
  return (
    <CardChrome id={block.id} label={t("Rhythm pattern")} onDelete={onDelete}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {NOTE_PALETTE.map((kind) => (
          <Button key={kind} type="button" size="sm" variant="outline" className="h-9 px-2.5" onClick={() => onChange({ ...block, pattern: [...block.pattern, kind] })}>
            <NoteGlyph kind={kind} className="size-5" />
          </Button>
        ))}
      </div>
      <div className="flex min-h-14 flex-wrap items-end gap-2 rounded-lg border border-dashed p-2">
        {block.pattern.length === 0 ? (
          <span className="self-center text-sm text-muted-foreground">{t("Tap a note or rest above to build the pattern.")}</span>
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
    </CardChrome>
  );
}

function ChordsCard({ block, onChange, onDelete }: { block: Extract<EditorBlock, { type: "chords" }>; onChange: (b: EditorBlock) => void; onDelete: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState("");

  function addItem() {
    const v = draft.trim();
    if (!v) return;
    onChange({ ...block, items: [...block.items, v] });
    setDraft("");
  }

  return (
    <CardChrome id={block.id} label={t("Chords / notes")} onDelete={onDelete}>
      <div className="grid gap-2">
        <Input value={block.label} onChange={(ev) => onChange({ ...block, label: ev.target.value })} placeholder={t("Label, e.g. Chords used")} />
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border p-2">
          {block.items.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
              {item}
              <button type="button" aria-label={t("Remove")} onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === ",") {
                ev.preventDefault();
                addItem();
              }
            }}
            onBlur={addItem}
            placeholder={t("Type a chord or note, Enter to add")}
            className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
          />
        </div>
      </div>
    </CardChrome>
  );
}

function MelodyCard({ block, onChange, onDelete }: { block: Extract<EditorBlock, { type: "melody" }>; onChange: (b: EditorBlock) => void; onDelete: () => void }) {
  const t = useT();

  function resize(bars: number) {
    const length = bars * MELODY_UNITS_PER_BAR;
    onChange({ ...block, length, notes: block.notes.filter((n) => n.start + n.units <= length) });
  }

  return (
    <CardChrome id={block.id} label={t("Melody (piano roll)")} onDelete={onDelete}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-muted-foreground">
          {t("Bars")}
          <Select className="mt-1 h-8 w-auto text-xs" value={String(block.length / MELODY_UNITS_PER_BAR)} onChange={(ev) => resize(Number(ev.target.value))}>
            {BAR_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <PianoRoll length={block.length} notes={block.notes} onChange={(notes) => onChange({ ...block, notes })} className="mb-3" />
      <StaffNotation length={block.length} notes={block.notes} className="rounded-lg border bg-card p-2" />
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
              return <MelodyCard key={b.id} block={b} onChange={(next) => updateBlock(b.id, next)} onDelete={() => removeBlock(b.id)} />;
            })}
          </div>
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("No content yet. Add a block below.")}</p>}

      <div className="flex flex-wrap gap-1.5 border-t pt-3">
        {ADD_BUTTONS.map(({ kind, label, icon: Icon }) => (
          <Button key={kind} type="button" size="sm" variant="outline" onClick={() => addBlock(kind)}>
            <Icon className="size-4" />
            {t(label)}
          </Button>
        ))}
      </div>
    </div>
  );
}
