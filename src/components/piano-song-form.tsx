"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, FileMusic, LoaderCircle, Upload, WandSparkles, X } from "lucide-react";
import { generateSongDraft, savePianoSong, type SongDraft } from "@/app/actions/piano-song";
import { FormMessage } from "@/components/form-message";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import { SongPianoRoll } from "@/components/song-piano-roll";
import { SongPlayer } from "@/components/song-player";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { MidiFileError, midiToNotation, notesToAngka, parseMidiFile, type MidiFile } from "@/lib/midi-file";
import { midiToNote, noteToMidi } from "@/lib/music";
import { detectDoMidi, MAX_SONG_NOTES, notesToRoll, parseSongNotation, songParseMessage, type Song, type SongFormat, type SongNote } from "@/lib/songs";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Values = { title: string; origin: string; level: number; bpm: number; format: SongFormat; doNote: string; notation: string };
const DO_NOTES = ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A3", "A#3", "B3"];

export function PianoSongForm({
  song,
  classroom,
  initialClassroomIds,
  providers,
  remaining,
  limit,
}: {
  song?: Values & { id: string };
  classroom: { id: string; name: string }[];
  initialClassroomIds: string[];
  providers: ProviderOption[];
  remaining: number;
  limit: number;
}) {
  const t = useT();
  const [state, action] = useActionState(savePianoSong, initialState);
  const [v, setV] = useState<Values>(song ?? { title: "", origin: "", level: 1, bpm: 90, format: "angka", doNote: "C4", notation: "" });
  const [classroomIds, setClassroomIds] = useState<string[]>(initialClassroomIds);
  const [showHelp, setShowHelp] = useState(false);
  // Bumped whenever the notation is replaced from outside the piano roll, so the roll reloads it.
  const [rollKey, setRollKey] = useState(0);
  const [formatNote, setFormatNote] = useState("");
  const set = <K extends keyof Values>(k: K, x: Values[K]) => setV((o) => ({ ...o, [k]: x }));
  const e = state.fieldErrors ?? {};

  const parsed = useMemo(() => parseSongNotation(v.format, v.notation, v.doNote), [v.format, v.notation, v.doNote]);
  const preview = useMemo<Song | null>(
    () =>
      parsed.ok
        ? { id: "preview", title: v.title || t("Preview"), level: 1, bpm: v.bpm, notes: parsed.notes, doMidi: v.doNote ? (noteToMidi(v.doNote) ?? undefined) : undefined }
        : null,
    [parsed, v.bpm, v.title, v.format, v.doNote, t],
  );
  // The key guessed from the notes, offered as "Automatic" for letters and piano roll songs.
  const detectedDo = useMemo(() => (parsed.ok && parsed.notes.length ? midiToNote(detectDoMidi(parsed.notes)) : "C4"), [parsed]);
  const parseError = !parsed.ok && v.notation.trim() ? t(...songParseMessage(parsed)) : null;

  const toggle = (id: string) => setClassroomIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  function fill(d: Partial<Values>) {
    // The melody is replaced; title and region only fill empty fields.
    setV((o) => ({ ...o, ...d, title: o.title.trim() || d.title || "", origin: o.origin.trim() || d.origin || "" }));
    setRollKey((k) => k + 1);
    setFormatNote("");
  }

  /** Switching to the piano roll keeps the melody exactly; switching away writes it as text (overlaps become chords). */
  function changeFormat(f: SongFormat) {
    if (f === v.format) return;
    setFormatNote("");
    let format = f;
    let notation = v.notation;
    // Notasi angka needs a "do"; the other formats may leave it on Automatic (empty).
    let doNote = f === "angka" ? v.doNote || detectedDo : v.notation.trim() ? v.doNote : "";
    if (f === "roll") {
      if (!parsed.ok && v.notation.trim()) return setFormatNote(t("Fix the melody first, then open it in the piano roll."));
      notation = parsed.ok ? notesToRoll(parsed.notes) : "";
    } else if (v.format === "roll" && parsed.ok) {
      const asLetters = () => midiToNotation(parsed.notes, { melodyOnly: false, keepLeadingRest: true });
      if (f === "angka") {
        const angka = notesToAngka(parsed.notes, noteToMidi(doNote) ?? 60, { melodyOnly: false, keepLeadingRest: true });
        if (angka === null) {
          format = "letters";
          notation = asLetters();
          setFormatNote(t("Some notes are not in the scale of do = {0}, so the melody is written in note letters.", doNote.replace(/\d/, "")));
        } else notation = angka;
      } else notation = asLetters();
      if (format === f) setFormatNote(t("The piano roll was written as text. Notes that overlap became chords; check the preview."));
    }
    if (format !== "angka" && f === "angka") doNote = v.doNote;
    setV((o) => ({ ...o, format, notation, doNote }));
    setRollKey((k) => k + 1);
  }

  return (
    <form action={action} className="grid gap-6">
      {song && <input type="hidden" name="id" value={song.id} />}
      <input type="hidden" name="classroomIds" value={JSON.stringify(classroomIds)} />
      <input type="hidden" name="format" value={v.format} />
      <input type="hidden" name="notation" value={v.notation} />

      <SongAiPanel providers={providers} remaining={remaining} limit={limit} onFill={fill} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Title")} htmlFor="title" error={e.title}>
          <Input id="title" name="title" value={v.title} onChange={(x) => set("title", x.target.value)} required maxLength={150} />
        </Field>
        <Field label={t("Region / composer (optional)")} htmlFor="origin" hint={t("e.g. Jawa Tengah, or Beethoven")} error={e.origin}>
          <Input id="origin" name="origin" value={v.origin} onChange={(x) => set("origin", x.target.value)} maxLength={120} />
        </Field>
        <Field label={t("Difficulty")} htmlFor="level">
          <Select id="level" name="level" value={v.level} onChange={(x) => set("level", Number(x.target.value))}>
            <option value={1}>★ {t("Easy")}</option>
            <option value={2}>★★ {t("Medium")}</option>
            <option value={3}>★★★ {t("Hard")}</option>
          </Select>
        </Field>
        <Field label={t("Tempo (BPM)")} htmlFor="bpm" error={e.bpm}>
          <Input id="bpm" name="bpm" type="number" min={30} max={240} value={v.bpm} onChange={(x) => set("bpm", Number(x.target.value))} required />
        </Field>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1.5 text-sm font-semibold">{t("Melody")}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["angka", t("Notasi angka (1 2 3)")],
              ["letters", t("Note letters (C4 D4 E4)")],
              ["roll", t("Piano roll (like FL Studio)")],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={v.format === f}
              onClick={() => changeFormat(f)}
              className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors", v.format === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {label}
            </button>
          ))}
          <label className="ml-auto inline-flex items-center gap-2 text-sm font-semibold">
            {t("Key: do =")}
            <Select name="doNote" className="h-10 w-auto" value={v.doNote} onChange={(x) => set("doNote", x.target.value)}>
              {v.format !== "angka" && (
                <option value="">
                  {t("Automatic")} ({detectedDo.replace(/\d/, "")})
                </option>
              )}
              {DO_NOTES.map((n) => (
                <option key={n} value={n}>
                  {n.replace(/\d/, "")}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {formatNote && <Alert kind="info">{formatNote}</Alert>}

        {v.format === "roll" ? (
          <SongPianoRoll
            key={rollKey}
            initial={parsed.ok ? parsed.notes : []}
            bpm={v.bpm >= 30 && v.bpm <= 240 ? v.bpm : 90}
            onBpmChange={(bpm) => set("bpm", bpm)}
            title={v.title}
            onChange={(notes) => set("notation", notesToRoll(notes))}
          />
        ) : (
          <Textarea
            rows={7}
            value={v.notation}
            onChange={(x) => set("notation", x.target.value)}
            className="font-mono text-sm"
            spellCheck={false}
            placeholder={v.format === "angka" ? "1 3 1 3 | 4 5 5 - | 7 1':0.5 7:0.5 5 0 |" : "E4 D4 C4 D4 | E4 E4 E4:2 |"}
            aria-label={t("Melody")}
          />
        )}
        {(parseError || e.notation) && <p className="text-xs font-medium text-danger">{parseError ?? e.notation}</p>}
        {parsed.ok && <p className="text-xs text-muted-foreground">{t("{0} notes", parsed.notes.length)}</p>}

        <button type="button" onClick={() => setShowHelp((x) => !x)} className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary">
          {showHelp ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />} {t("How to write the melody")}
        </button>
        {showHelp && (
          <div className="grid gap-1.5 rounded-lg bg-muted p-3 text-sm">
            {v.format === "roll" ? (
              <>
                <p>
                  <b>{t("Mouse")}:</b> {t("click an empty spot to add a note, drag a note to move it, drag its right edge to make it longer, right-click to delete. Shift+click selects several notes.")}
                </p>
                <p>
                  <b>{t("Phone / tablet")}:</b> {t("tap to add a note, drag a note to move it, swipe the empty grid to scroll. Use the Erase tool to delete.")}
                </p>
                <p>
                  <b>{t("Keyboard")}:</b>{" "}
                  {t("Space = play/stop · Delete = delete · Ctrl+Z / Ctrl+Y = undo/redo · Ctrl+A = select all · Ctrl+B = duplicate · ↑↓ = semitone (Shift = octave) · ←→ = move")}
                </p>
                <p>
                  <b>{t("Touch piano")}:</b>{" "}
                  {t("press Record, wait for the one-bar count-in, then play: notes are written in time with the tempo, and holding a key makes a longer note. Click the bar numbers to move the green line where recording starts.")}
                </p>
                <p>{t("Click the bar numbers to play from that bar. Notes may overlap (chords, held bass notes). Download MIDI opens the song in FL Studio or another DAW.")}</p>
              </>
            ) : v.format === "angka" ? (
              <>
                <p>
                  <code>1 2 3 4 5 6 7</code> = do re mi fa sol la si · <code>1&apos;</code> = {t("one octave up")} · <code>5.</code> = {t("one octave down")} · <code>0</code> = {t("rest")}
                </p>
              </>
            ) : (
              <p>
                <code>C4 D#4 Bb3</code> = {t("note name and octave (middle C = C4)")} · <code>R</code> = {t("rest")}
              </p>
            )}
            {v.format !== "roll" && (
              <>
              <p>
                <code>-</code> = {t("hold the previous note one more beat")} · <code>:0.5</code> = {t("eighth note")} · <code>:2</code> = {t("half note")} · <code>:1.5</code> = {t("dotted quarter")}
              </p>
              <p>
                <code>|</code> = {t("bar line (optional, ignored)")} · <code>{v.format === "angka" ? "1+3+5:2" : "C4+E4+G4:2"}</code> = {t("chord")}
              </p>
              </>
            )}
          </div>
        )}
      </fieldset>

      {preview && (
        <div className="grid gap-2">
          <p className="text-sm font-semibold">{t("Try it")}</p>
          {/* In the piano roll the laptop keyboard belongs to the touch piano that writes notes. */}
          <SongPlayer key={`${v.format}|${v.doNote}|${v.notation}|${v.bpm}`} songs={[preview]} saveScores={false} computerKeys={v.format !== "roll"} />
        </div>
      )}

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t("Show to classes")}</legend>
        <p className="mb-3 text-xs text-muted-foreground">{t("Students in the ticked classes find this song in Virtual Piano → Play a Song.")}</p>
        {classroom.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("There are no classes yet. Create a class first (the song can still be saved as a draft).")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {classroom.map((k) => {
              const on = classroomIds.includes(k.id);
              return (
                <label key={k.id} className={cn("flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3", on && "border-primary bg-primary-soft/50")}>
                  <input type="checkbox" checked={on} onChange={() => toggle(k.id)} className="size-5 shrink-0 accent-[var(--primary)]" />
                  <span className="min-w-0 break-words font-semibold">{k.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <FormMessage state={state} />
      <div>
        <SubmitButton size="lg" pendingText={t("Saving…")}>
          {song ? t("Save changes") : t("Save song")}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Fill the song from a prompt, a photo of sheet music, and/or a MIDI file. MIDI alone can be converted without AI. */
function SongAiPanel({ providers, remaining: remainingInitial, limit, onFill }: { providers: ProviderOption[]; remaining: number; limit: number; onFill: (d: Partial<Values>) => void }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [pick, setPick] = useProviderPick();
  const anyProvider = providers.some((o) => o.available);
  const available = providerReady(providers, pick);
  const [remaining, setRemaining] = useState(remainingInitial);
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [midi, setMidi] = useState<{ name: string; file: MidiFile } | null>(null);
  const [melodyOnly, setMelodyOnly] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ note: string; warning: string | null } | null>(null);
  const [busy, startBusy] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => void (imageUrl && URL.revokeObjectURL(imageUrl)), [imageUrl]);

  async function onFile(f: File | undefined) {
    setError("");
    if (!f) return;
    const name = f.name.toLowerCase();
    if (/\.midi?$/.test(name)) {
      try {
        setMidi({ name: f.name, file: parseMidiFile(await f.arrayBuffer()) });
      } catch (err) {
        setError(t(err instanceof MidiFileError ? err.message : "The MIDI file could not be read."));
      }
    } else if (/\.(jpe?g|png)$/.test(name)) {
      if (f.size > 8 * 1024 * 1024) return setError(t("The photo is too large (max 8 MB)."));
      setImage(f);
    } else setError(t("Use a photo (.jpg, .png) or a MIDI file (.mid)."));
    if (fileRef.current) fileRef.current.value = "";
  }

  const midiText = midi ? midiToNotation(midi.file.notes, { melodyOnly }) : "";

  /** Opens the MIDI file in the piano roll as it is (or only its top melody line). No AI needed. */
  function fromMidi() {
    if (!midi) return;
    let notes: SongNote[] = midi.file.notes;
    if (melodyOnly) {
      const r = parseSongNotation("letters", midiToNotation(notes, { melodyOnly: true, keepLeadingRest: true }));
      notes = r.ok ? r.notes : [];
    }
    // Start at the first bar that has a note.
    const offset = Math.floor(Math.min(...notes.map((n) => n.start)) / 4) * 4;
    notes = notes.slice(0, MAX_SONG_NOTES).map((n) => ({ midi: n.midi, start: Math.round((n.start - offset) * 1000) / 1000, beats: Math.max(0.01, Math.round(n.beats * 1000) / 1000) }));
    onFill({ format: "roll", doNote: "", notation: notesToRoll(notes), bpm: midi.file.bpm, title: midi.name.replace(/\.midi?$/i, "").replace(/[_-]+/g, " ") });
    const note = t("The MIDI file is open in the piano roll below (no AI). Check the melody and remove parts you don't need.");
    setResult({ note: midi.file.notes.length > MAX_SONG_NOTES && !melodyOnly ? `${note} ${t("Only the first {0} notes were kept.", MAX_SONG_NOTES)}` : note, warning: null });
  }

  function withAi() {
    setError("");
    setResult(null);
    startBusy(async () => {
      const fd = new FormData();
      fd.set("prompt", prompt.trim());
      fd.set("provider", pick);
      if (image) fd.set("image", image);
      if (midi) {
        fd.set("midiText", midiText.slice(0, 30_000));
        fd.set("midiBpm", String(midi.file.bpm));
      }
      const r = await generateSongDraft(fd);
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not create the song."));
      const d: SongDraft = r.data.draft;
      setRemaining(r.data.remaining);
      onFill({ title: d.title, origin: d.origin, level: d.level, bpm: d.bpm, format: d.format, doNote: d.doNote, notation: d.notation });
      setResult({ note: d.note, warning: r.data.warning });
    });
  }

  const hasInput = prompt.trim() || image || midi;

  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setOpen((x) => !x)} className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold" aria-expanded={open}>
        <WandSparkles className="size-4 text-primary" />
        {t("Fill with AI or a MIDI file")}
        {open ? <ChevronUp className="ml-auto size-4" /> : <ChevronDown className="ml-auto size-4" />}
      </button>
      {open && (
        <div className="grid gap-4 border-t p-3.5">
          <p className="text-sm text-muted-foreground">
            {t("Describe the song, add a photo of the sheet music (notasi angka or staff), or add a MIDI file. The result fills the form below; check it in the preview before saving.")}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ProviderSelect options={providers} value={pick} onChange={setPick} />
            <Badge tone={remaining > 0 ? "primary" : "danger"}>
              {t("Remaining today:")} {remaining}/{limit}
            </Badge>
          </div>

          <Field label={t("Prompt")} htmlFor="ai-song-prompt" hint={t("e.g. \"Gundul-Gundul Pacul, do = C, for grade 4\" or \"take the right hand only, slower tempo\"")}>
            <Textarea id="ai-song-prompt" rows={3} value={prompt} onChange={(x) => setPrompt(x.target.value)} maxLength={2000} />
          </Field>

          <div className="grid gap-2">
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.mid,.midi,image/jpeg,image/png,audio/midi" className="hidden" onChange={(x) => void onFile(x.target.files?.[0])} />
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload /> {t("Add photo or MIDI")}
              </Button>
            </div>
            {image && imageUrl && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="h-16 w-auto rounded border object-contain" />
                <span className="min-w-0 break-all">{image.name}</span>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("Remove")} onClick={() => setImage(null)}>
                  <X />
                </Button>
              </div>
            )}
            {midi && (
              <div className="grid gap-2 rounded-lg bg-muted p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <FileMusic className="size-4 text-primary" />
                  <span className="min-w-0 break-all font-semibold">{midi.name}</span>
                  <span className="text-muted-foreground">{t("{0} notes · {1} BPM", midi.file.notes.length, midi.file.bpm)}</span>
                  <Button type="button" variant="ghost" size="icon" className="ml-auto size-8" aria-label={t("Remove")} onClick={() => setMidi(null)}>
                    <X />
                  </Button>
                </div>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={melodyOnly} onChange={(x) => setMelodyOnly(x.target.checked)} className="size-4 accent-[var(--primary)]" />
                  {t("Melody only (highest note); untick to keep chords")}
                </label>
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={fromMidi}>
                    <FileMusic /> {t("Open in the piano roll (no AI)")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {!anyProvider && <Alert kind="warning">{t("AI is not enabled on this server. You can still convert a MIDI file or write the melody yourself.")}</Alert>}
          {anyProvider && !available && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}
          {error && <Alert kind="error">{error}</Alert>}
          {result?.warning && <Alert kind="warning">{t("The AI's melody has a problem; fix it below: {0}", result.warning)}</Alert>}
          {result?.note && <Alert kind="info">{result.note}</Alert>}

          <div>
            <Button type="button" onClick={withAi} disabled={!available || busy || !hasInput || remaining <= 0}>
              {busy ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {busy ? t("The AI is writing…") : t("Create with AI")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
