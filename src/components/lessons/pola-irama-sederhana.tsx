"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { markMaterialCompleted } from "@/app/actions/material";
import { RhythmPractice } from "@/components/rhythm-practice";
import { TempoPractice } from "@/components/tempo-practice";
import { Button } from "@/components/ui/button";
import { audioTime, scheduleClick, startMetronome, unlockAudio, type ClickVoice } from "@/lib/audio";
import { RHYTHM_PATTERNS, type RhythmPattern } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { NoteGlyph, type NoteGlyphKind } from "./note-glyph";
import { Eyebrow, LessonTabs, QuizItem, Reveal, type MCQ } from "./shared";

const SECTIONS = [
  "Sampul",
  "Konsep Dasar",
  "Ketukan",
  "Notasi",
  "Birama 4/4",
  "Pola Irama",
  "Latihan Tiru",
  "Alat Ritmis",
  "Alur Latihan",
  "Studi Kasus",
  "Kuis",
  "Rangkuman",
  "LKPD HOTS",
  "Praktik Ansambel",
] as const;

const VOICES: { id: ClickVoice; label: string }[] = [
  { id: "tepuk", label: "Tepuk tangan" },
  { id: "kentongan", label: "Kentongan" },
  { id: "tamborin", label: "Tamborin" },
];

/** "Pola Irama & Ritme Sederhana" — Seni Musik, Kelas VII. Registered as slug "pola-irama-sederhana". */
export function PolaIramaSederhana({ materialId, completedInitial, preview }: { materialId: string; completedInitial: boolean; preview?: boolean }) {
  const [active, setActive] = useState(0);
  const go = (i: number) => setActive(Math.max(0, Math.min(SECTIONS.length - 1, i)));

  return (
    <div className="grid gap-6">
      <LessonTabs labels={[...SECTIONS]} active={active} onSelect={go} label="Bagian materi" />
      <p className="text-xs font-semibold text-muted-foreground">
        Bagian {active + 1} dari {SECTIONS.length}
      </p>

      <div className="rounded-2xl border bg-card p-5 shadow-xs sm:p-7">
        {active === 0 && <Sampul onStart={() => go(1)} onQuiz={() => go(10)} />}
        {active === 1 && <KonsepDasar />}
        {active === 2 && <Ketukan materialId={materialId} preview={preview} />}
        {active === 3 && <Notasi />}
        {active === 4 && <Birama44 />}
        {active === 5 && <PolaIramaBank />}
        {active === 6 && <LatihanTiru materialId={materialId} preview={preview} />}
        {active === 7 && <AlatRitmis />}
        {active === 8 && <AlurLatihan />}
        {active === 9 && <StudiKasus />}
        {active === 10 && <Kuis />}
        {active === 11 && <Rangkuman />}
        {active === 12 && <LkpdHots />}
        {active === 13 && <PraktikAnsambel materialId={materialId} completedInitial={completedInitial} preview={preview} />}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => go(active - 1)} disabled={active === 0}>
          ← Sebelumnya
        </Button>
        <span className="hidden text-xs font-bold uppercase tracking-wide text-muted-foreground sm:inline">{SECTIONS[active]}</span>
        <Button onClick={() => go(active + 1)} disabled={active === SECTIONS.length - 1}>
          Berikutnya →
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function TempoNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-bold">{title}</p>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

function VoicePicker({ voice, onChange }: { voice: ClickVoice; onChange: (v: ClickVoice) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="self-center text-xs font-bold text-muted-foreground uppercase">Bunyi</span>
      {VOICES.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors", voice === v.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-card")}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Sampul                                                            */
/* ------------------------------------------------------------------ */

function Sampul({ onStart, onQuiz }: { onStart: () => void; onQuiz: () => void }) {
  return (
    <section className="grid gap-5">
      <Eyebrow>Materi Pembelajaran Interaktif</Eyebrow>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Pola Irama &amp; Ritme Sederhana</h2>
      <p className="text-lg text-muted-foreground italic">
        Belajar menirukan pola irama sederhana dengan tepuk tangan, hentakan kaki, dan alat musik ritmis — lengkap dengan contoh notasi yang bisa kamu dengarkan.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-primary uppercase">Tujuan Pembelajaran</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Menjelaskan perbedaan irama, ketukan, tempo, dan pola irama.</li>
            <li>Membaca dan menirukan notasi pola irama sederhana dalam birama 4/4.</li>
            <li>Menampilkan pola irama secara berkelompok dengan tempo yang stabil.</li>
          </ol>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-primary uppercase">Yang Kamu Butuhkan</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>Sepasang tangan dan sepasang kaki.</li>
            <li>Alat musik ritmis sederhana: tamborin, kentongan, atau botol berisi beras.</li>
            <li>Kelompok kecil berisi 3–4 orang (untuk Bagian 14).</li>
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={onStart}>
          Mulai belajar →
        </Button>
        <Button size="lg" variant="outline" onClick={onQuiz}>
          Langsung ke kuis
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Konsep Dasar                                                      */
/* ------------------------------------------------------------------ */

function Konsep({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-1.5 font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function BeatGrid({
  row1Label,
  row1,
  row2Label,
  row2,
}: {
  row1Label: string;
  row1: string[];
  row2Label: string;
  row2: { l: string; on: boolean }[];
}) {
  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-[5rem_1fr] items-center gap-1.5">
        <span className="text-xs font-bold text-primary">{row1Label}</span>
        <div className="grid grid-cols-4 gap-1.5">
          {row1.map((n, i) => (
            <div key={i} className={cn("rounded-md py-2 text-center text-sm font-bold", i === 0 ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary")}>
              {n}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[5rem_1fr] items-center gap-1.5">
        <span className="text-xs font-bold text-primary">{row2Label}</span>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row2.length}, 1fr)` }}>
          {row2.map((c, i) => (
            <div key={i} className={cn("rounded-md py-2 text-center text-sm font-bold", c.on ? "bg-accent text-accent-foreground" : "border-2 border-dashed border-danger/50 text-danger")}>
              {c.l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KonsepDasar() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Bagian 1</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Irama, Ketukan, dan Pola Irama</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Konsep title="Ketukan">Denyut dasar yang stabil — seperti detak jantung musik. Ia menjadi patokan waktu dan tidak pernah berubah kecepatannya.</Konsep>
        <Konsep title="Irama">Susunan bunyi panjang–pendek atau bunyi–diam yang berulang secara teratur di atas ketukan.</Konsep>
        <Konsep title="Pola Irama">
          Satu susunan bunyi dan diam yang dipakai berulang-ulang secara konsisten, misalnya <em>tepuk – tepuk – diam – tepuk</em>.
        </Konsep>
        <Konsep title="Birama">
          Pengelompokan ketukan ke dalam ruas-ruas yang sama panjang, ditandai garis birama. Birama <strong>4/4</strong> berarti empat ketukan setiap ruas dengan aksen pada ketukan pertama.
        </Konsep>
      </div>
      <div className="rounded-xl bg-muted p-5">
        <p className="mb-3 text-xs font-bold text-muted-foreground uppercase">Diagram — dua lapis yang berjalan bersamaan</p>
        <BeatGrid
          row1Label="Ketukan"
          row1={["1", "2", "3", "4"]}
          row2Label="Pola Irama"
          row2={[
            { l: "tepuk", on: true },
            { l: "tepuk", on: true },
            { l: "diam", on: false },
            { l: "tepuk", on: true },
          ]}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Ketukan tetap berjalan walaupun kamu sedang diam. Diam pada ketukan ke-3 tetap dihitung — inilah yang sering terlewat sehingga tepukan berikutnya datang terlalu cepat.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Ketukan (metronome tool)                                         */
/* ------------------------------------------------------------------ */

function Ketukan({ materialId, preview }: { materialId: string; preview?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(80);
  const [voice, setVoice] = useState<ClickVoice>("tepuk");
  const [beat, setBeat] = useState(-1);
  const stopRef = useRef<(() => void) | null>(null);
  const bpmRef = useRef(bpm);
  const voiceRef = useRef(voice);
  bpmRef.current = bpm;
  voiceRef.current = voice;

  const toggle = useCallback(async () => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      setPlaying(false);
      setBeat(-1);
      return;
    }
    await unlockAudio();
    stopRef.current = startMetronome(
      () => bpmRef.current,
      4,
      (idx) => setBeat(idx),
      () => voiceRef.current,
    );
    setPlaying(true);
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  return (
    <section className="grid gap-5">
      <Eyebrow>Alat Bantu</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Rasakan Ketukan Dasar</h2>
      <p className="text-muted-foreground">
        Nyalakan ketukan di bawah ini, lalu hitung <em>satu–dua–tiga–empat</em> dengan suara pelan. Ketukan pertama terdengar lebih tegas karena menjadi aksen awal birama.
      </p>

      <div className="rounded-xl bg-muted p-5">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "grid aspect-video place-items-center rounded-lg border text-2xl font-bold transition-colors",
                playing && beat === i ? (i === 0 ? "border-primary bg-primary text-primary-foreground" : "border-accent bg-accent text-accent-foreground") : "bg-card",
              )}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button onClick={toggle} variant={playing ? "outline" : "default"}>
            {playing ? (
              <>
                <Pause /> Hentikan ketukan
              </>
            ) : (
              <>
                <Play /> Mulai ketukan
              </>
            )}
          </Button>
          <label className="min-w-48 flex-1 text-sm font-semibold">
            Tempo — {bpm} ketukan per menit
            <input type="range" min={50} max={140} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="mt-2 block w-full accent-[var(--primary)]" />
          </label>
        </div>
        <div className="mt-4">
          <VoicePicker voice={voice} onChange={setVoice} />
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <TempoNote title="Tempo lambat (50–70)">untuk mengenali pola baru dan memastikan setiap diam benar-benar dihitung.</TempoNote>
        <TempoNote title="Tempo sedang (80–100)">tempo latihan kelompok yang paling nyaman.</TempoNote>
        <TempoNote title="Tempo cepat (110+)">uji kestabilan; jika pola mulai berantakan, turunkan lagi.</TempoNote>
      </div>

      <div className="grid gap-2">
        <h3 className="text-lg font-bold">Uji Kestabilan Tempomu</h3>
        <p className="text-sm text-muted-foreground">
          Dengarkan empat ketukan, ikuti empat ketukan berikutnya, lalu ketukan berhenti — teruskan tepukanmu sendiri dengan tempo yang sama. Skormu tercatat untuk gurumu.
        </p>
        <TempoPractice saveResult={!preview} materialId={materialId} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Notasi                                                            */
/* ------------------------------------------------------------------ */

const NOTASI: { kind: NoteGlyphKind; nama: string; dibaca: string; nilai: string }[] = [
  { kind: "whole", nama: "Not penuh", dibaca: "bunyi ditahan panjang", nilai: "4 ketukan" },
  { kind: "half", nama: "Not setengah", dibaca: "bunyi agak panjang", nilai: "2 ketukan" },
  { kind: "quarter", nama: "Not seperempat", dibaca: "satu tepukan biasa", nilai: "1 ketukan" },
  { kind: "eighth", nama: "Not seperdelapan", dibaca: "tepukan pendek, dua dalam satu ketukan", nilai: "½ ketukan" },
  { kind: "rest-quarter", nama: "Tanda diam seperempat", dibaca: "diam, tetap dihitung", nilai: "1 ketukan" },
  { kind: "rest-eighth", nama: "Tanda diam seperdelapan", dibaca: "diam sangat singkat", nilai: "½ ketukan" },
];

function Notasi() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Contoh Notasi</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Nilai Not dan Tanda Diam</h2>
      <p className="text-muted-foreground">
        Pola irama ditulis dengan lambang not (bunyi) dan tanda istirahat (diam). Nilai di kolom terakhir menunjukkan berapa ketukan lambang itu berbunyi atau berdiam.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-md border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-bold text-muted-foreground uppercase">
              <th className="py-2 pr-4">Lambang</th>
              <th className="py-2 pr-4">Nama</th>
              <th className="py-2 pr-4">Dibaca</th>
              <th className="py-2">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {NOTASI.map((r) => (
              <tr key={r.nama} className="border-b last:border-0">
                <td className="py-3 pr-4">
                  <NoteGlyph kind={r.kind} className="size-7" />
                </td>
                <td className="py-3 pr-4 font-bold">{r.nama}</td>
                <td className="py-3 pr-4 text-muted-foreground">{r.dibaca}</td>
                <td className="py-3 font-semibold">{r.nilai}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl bg-muted p-4 text-sm">
        <p className="font-bold">Cara cepat membacanya</p>
        <p className="text-muted-foreground">
          Hitung ketukan dengan angka (1-2-3-4). Kalau ada dua not seperdelapan dalam satu ketukan, ucapkan &quot;not-dan&quot; — misalnya &quot;1-dan&quot; untuk dua tepukan pendek di ketukan pertama.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Birama 4/4                                                        */
/* ------------------------------------------------------------------ */

function Birama44() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Struktur Birama</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Membaca Birama 4/4</h2>
      <p className="text-muted-foreground">
        Angka atas (4) berarti ada <strong>empat ketukan</strong> setiap ruas birama. Angka bawah (4) berarti not seperempat yang dihitung satu ketukan. Ketukan pertama setiap ruas terasa paling
        &quot;kuat&quot; — di situlah biasanya pola dimulai atau kembali.
      </p>
      <div className="rounded-xl bg-muted p-5">
        <p className="mb-3 text-xs font-bold text-muted-foreground uppercase">Dua ruas birama 4/4 berurutan</p>
        <div className="grid grid-cols-8 gap-1.5">
          {[1, 2, 3, 4, 1, 2, 3, 4].map((n, i) => (
            <div
              key={i}
              className={cn(
                "rounded-md py-3 text-center text-sm font-bold",
                n === 1 ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
                i === 4 && "rounded-l-none border-l-2 border-foreground/30",
              )}
            >
              {n}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Ketukan 1 = <strong>kuat</strong>, ketukan 2-3-4 = <strong>lemah</strong>. Hitungan kembali ke 1 setiap kali garis birama (batas ruas) dilewati — bukan berhenti, tapi mengulang.
        </p>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <TempoNote title="Kenapa penting?">Kalau kamu tahu di mana ketukan 1 jatuh, kamu tidak akan tersesat walau polanya penuh dengan diam.</TempoNote>
        <TempoNote title="Latihan cepat">Sambil berjalan di tempat, hentakkan kaki lebih keras di ketukan 1 dan lebih ringan di ketukan 2-3-4.</TempoNote>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Pola Irama (bank pola)                                            */
/* ------------------------------------------------------------------ */

const POLA_GRID: Record<string, { label: string; kind: NoteGlyphKind; bunyi: boolean }[]> = {
  "pola-a": [
    { label: "1", kind: "quarter", bunyi: true },
    { label: "2", kind: "quarter", bunyi: true },
    { label: "3", kind: "rest-quarter", bunyi: false },
    { label: "4", kind: "quarter", bunyi: true },
  ],
  "pola-b": [
    { label: "1", kind: "eighth", bunyi: true },
    { label: "dan", kind: "eighth", bunyi: true },
    { label: "2", kind: "eighth", bunyi: true },
    { label: "3", kind: "eighth", bunyi: true },
    { label: "dan", kind: "eighth", bunyi: true },
    { label: "4", kind: "eighth", bunyi: true },
  ],
  "pola-c": [
    { label: "1", kind: "quarter", bunyi: true },
    { label: "2", kind: "eighth", bunyi: true },
    { label: "dan", kind: "eighth", bunyi: true },
    { label: "3", kind: "quarter", bunyi: true },
    { label: "4", kind: "rest-quarter", bunyi: false },
  ],
  "pola-d": [
    { label: "1", kind: "rest-quarter", bunyi: false },
    { label: "2", kind: "quarter", bunyi: true },
    { label: "3", kind: "eighth", bunyi: true },
    { label: "dan", kind: "eighth", bunyi: true },
    { label: "4", kind: "quarter", bunyi: true },
  ],
};

const POLA_PATTERNS: RhythmPattern[] = RHYTHM_PATTERNS.filter((p) => p.id.startsWith("pola-"));

function PolaIramaBank() {
  const [bpm, setBpm] = useState(80);
  const [voice, setVoice] = useState<ClickVoice>("tepuk");
  const [playingId, setPlayingId] = useState<string | null>(null);

  async function listen(p: RhythmPattern) {
    await unlockAudio();
    setPlayingId(p.id);
    const d = 60 / bpm;
    const start = audioTime() + 0.08;
    p.onset.forEach((o) => scheduleClick(start + o * d, o === 0, voice));
    window.setTimeout(
      () => setPlayingId((cur) => (cur === p.id ? null : cur)),
      (p.length * d + 0.2) * 1000,
    );
  }

  return (
    <section className="grid gap-5">
      <Eyebrow>Bank Pola</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Empat Pola Irama Sederhana</h2>
      <p className="text-muted-foreground">
        Dengarkan dulu, baru tirukan. Mulailah dari Pola A, dan baru lanjut ke pola berikutnya kalau tepukanmu sudah stabil dari awal sampai akhir.
      </p>

      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-muted p-4">
        <label className="min-w-48 flex-1 text-sm font-semibold">
          Tempo — {bpm} BPM
          <input type="range" min={50} max={140} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="mt-2 block w-full accent-[var(--primary)]" />
        </label>
        <VoicePicker voice={voice} onChange={setVoice} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {POLA_PATTERNS.map((p) => (
          <div key={p.id} className="rounded-xl bg-muted p-4">
            <h3 className="font-bold">{p.name}</h3>
            <p className="mb-3 text-sm text-muted-foreground italic">{p.description}</p>
            <div className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${POLA_GRID[p.id].length}, 1fr)` }}>
              {POLA_GRID[p.id].map((c, i) => (
                <div key={i} className="grid justify-items-center gap-1 rounded-md bg-card py-2">
                  <NoteGlyph kind={c.kind} />
                  <span className={cn("text-xs font-bold", c.bunyi ? "text-foreground" : "text-danger")}>{c.label}</span>
                  <span className="text-[0.65rem] font-semibold text-muted-foreground uppercase">{c.bunyi ? "bunyi" : "diam"}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => listen(p)} disabled={playingId === p.id}>
                <Play className="size-3.5" /> Dengarkan
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/student/practice/rhythm?pattern=${p.id}`}>Latih pola ini →</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Latihan Tiru                                                      */
/* ------------------------------------------------------------------ */

function LatihanTiru({ materialId, preview }: { materialId: string; preview?: boolean }) {
  return (
    <section className="grid gap-5">
      <Eyebrow>Praktik</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Tirukan Polanya</h2>
      <p className="text-muted-foreground">
        Pilih pola, dengarkan aba-aba empat ketukan, lalu tirukan pola pilihanmu sebanyak dua ruas birama. Tekan tombol besar atau tekan <strong>spasi</strong> tepat pada setiap bunyi.
      </p>
      <RhythmPractice initialPatternId="pola-a" saveResult={!preview} materialId={materialId} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Alat Ritmis                                                       */
/* ------------------------------------------------------------------ */

const ALAT: { media: string; cara: string; karakter: string; catatan: string }[] = [
  { media: "Tepuk tangan", cara: "Kedua telapak tangan dibenturkan", karakter: "Pendek dan tajam", catatan: "Selalu tersedia; paling mudah untuk pola baru" },
  { media: "Hentakan kaki", cara: "Telapak kaki dihentakkan ke lantai", karakter: "Rendah dan berat", catatan: "Cocok untuk menandai ketukan dasar" },
  { media: "Tamborin", cara: "Dipukul atau digoyangkan", karakter: "Nyaring, berdenting panjang", catatan: "Bunyi menyambung — jaga agar diam tetap terasa" },
  { media: "Kentongan", cara: "Dipukul dengan tongkat kayu", karakter: "Kering dan tegas", catatan: "Sangat jelas untuk pola cepat" },
  { media: "Botol berisi beras", cara: "Dikocok atau ditepuk ke telapak tangan", karakter: "Bergemerisik, pendek", catatan: "Pengganti alat sekolah yang mudah dibuat sendiri" },
];

function AlatRitmis() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Media Bunyi</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Alat Musik Ritmis</h2>
      <p className="text-muted-foreground">
        Alat musik ritmis tidak memiliki nada tetap; tugasnya menegaskan irama. Kalau alat di sekolah terbatas, benda sehari-hari pun bisa dipakai asal bunyinya jelas dan pendek.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-lg border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-bold text-muted-foreground uppercase">
              <th className="py-2 pr-4">Media</th>
              <th className="py-2 pr-4">Cara Membunyikan</th>
              <th className="py-2 pr-4">Karakter Bunyi</th>
              <th className="py-2">Catatan Latihan</th>
            </tr>
          </thead>
          <tbody>
            {ALAT.map((a) => (
              <tr key={a.media} className="border-b last:border-0">
                <td className="py-3 pr-4 font-bold">{a.media}</td>
                <td className="py-3 pr-4 text-muted-foreground">{a.cara}</td>
                <td className="py-3 pr-4 text-muted-foreground">{a.karakter}</td>
                <td className="py-3 text-muted-foreground">{a.catatan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 9. Alur Latihan                                                      */
/* ------------------------------------------------------------------ */

const ALUR: { title: string; body: string }[] = [
  { title: "Dengarkan sampai hafal", body: "Putar pola beberapa kali sambil menghitung dalam hati. Jangan langsung menepuk." },
  { title: "Hitung sambil dengar", body: "Ucapkan angka ketukan (1-2-3-4) pelan-pelan, sambil menandai kapan bunyi dan kapan diam." },
  { title: "Tirukan pelan-pelan", body: "Mulai di tempo lambat (50-70 BPM). Fokus pada ketepatan, bukan kecepatan." },
  { title: "Naikkan tempo bertahap", body: "Setelah tiga kali berturut-turut tepat, naikkan tempo sedikit demi sedikit." },
  { title: "Tampilkan berkelompok", body: "Padukan dengan teman: satu pola, beberapa alat bunyi berbeda, tempo yang sama untuk semua orang." },
];

function AlurLatihan() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Langkah Belajar</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Alur Latihan</h2>
      <ol className="grid gap-3">
        {ALUR.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-xl bg-muted p-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
            <div>
              <p className="font-bold">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 10. Studi Kasus                                                      */
/* ------------------------------------------------------------------ */

function StudiKasus() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Studi Kasus</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Kelompok Rani Kehilangan Tempo</h2>
      <div className="rounded-xl bg-muted p-5 text-sm leading-relaxed">
        <p>
          Kelompok Rani berlatih Pola A — <em>tepuk, tepuk, diam, tepuk</em> — di tempo 80 BPM. Di putaran pertama semua kompak. Tapi mulai putaran ketiga, tepukan terakhir (ketukan 4) selalu
          datang lebih cepat dari seharusnya, dan lama-lama seluruh kelompok jadi berantakan.
        </p>
      </div>
      <div className="grid gap-2">
        <p className="font-bold">Coba analisis:</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Ketukan mana yang kemungkinan besar tidak dihitung dengan benar oleh kelompok Rani?</li>
          <li>Kenapa sebuah &quot;diam&quot; bisa membuat seluruh pola jadi lebih cepat kalau tidak dihitung?</li>
          <li>Apa satu perbaikan sederhana yang bisa langsung dicoba kelompok Rani di latihan berikutnya?</li>
        </ol>
      </div>
      <Reveal title="Lihat pembahasan singkat">
        Ketukan ke-3 (diam) yang paling sering &quot;dilewati&quot; secara diam-diam — kelompok berhenti menghitung selama diam, lalu buru-buru menepuk ketukan 4 begitu terasa sudah
        &quot;waktunya&quot;. Perbaikannya: tetap ucapkan angka ketukan dalam hati bahkan saat sedang diam, dan gunakan metronom (Bagian 3) di tempo yang lebih lambat sampai semua anggota
        kompak.
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 11. Kuis (self-check)                                                */
/* ------------------------------------------------------------------ */

const KUIS: MCQ[] = [
  {
    q: "Kelompokmu menepuk pola tepuk–tepuk–diam–tepuk. Pada bagian diam, kalian tidak ikut menghitung, sehingga tepukan terakhir datang terlalu cepat. Apa yang paling tepat dilakukan?",
    options: [
      "Menghitung “tiga” dalam hati saat diam, lalu menepuk pada hitungan keempat",
      "Melewati hitungan ketiga karena toh tidak ada bunyi",
      "Mempercepat tempo supaya diam terasa lebih singkat",
      "Mengganti pola dengan pola yang tidak punya diam",
    ],
    correct: 0,
    explain: "Ketukan tetap berjalan walau sedang diam — diam tetap dihitung, bukan dilewati, agar bunyi berikutnya jatuh tepat pada ketukan yang benar.",
  },
  {
    q: "Pola B — Langkah Ganda dibaca “1-dan-2-3-dan-4”. Berapa nilai satu not pada hitungan “dan”?",
    options: ["1 ketukan", "½ ketukan", "2 ketukan", "¼ ketukan"],
    correct: 1,
    explain: "“Dan” menandai not seperdelapan, yaitu setengah ketukan — dua not seperdelapan sama dengan satu ketukan penuh.",
  },
  {
    q: "Sebuah pola dimulai dengan tanda diam seperempat pada ketukan pertama, seperti Pola D. Apa risiko paling umum saat menirukan pola ini?",
    options: [
      "Menepuk terlalu keras di ketukan pertama",
      "Justru ikut menepuk di ketukan pertama karena lupa itu tanda diam",
      "Tempo menjadi terlalu lambat",
      "Bunyi terakhir menjadi dua kali lebih panjang",
    ],
    correct: 1,
    explain: "Karena polanya “mulai dari diam”, banyak pemula reflek menepuk di ketukan 1 — padahal bunyi pertama baru muncul di ketukan 2.",
  },
  {
    q: "Kentongan dipukul dengan tongkat kayu dan menghasilkan bunyi kering serta tegas. Kapan karakter ini paling berguna?",
    options: [
      "Untuk pola dengan tempo cepat, karena bunyinya jelas dan tidak menyambung",
      "Untuk not penuh yang harus ditahan panjang",
      "Untuk latihan bernyanyi tanpa ketukan",
      "Untuk menggantikan metronom digital sepenuhnya",
    ],
    correct: 0,
    explain: "Bunyi kentongan pendek dan tegas sehingga setiap tepukan tetap terdengar jelas walau pola dimainkan cepat — berbeda dari tamborin yang berdenting panjang.",
  },
  {
    q: "Birama 4/4 berarti…",
    options: [
      "Empat ruas birama dalam satu lagu",
      "Empat ketukan setiap ruas, dengan not seperempat bernilai satu ketukan",
      "Lagu harus dimainkan dalam tempo 44 BPM",
      "Setiap ketukan dibagi menjadi empat bunyi",
    ],
    correct: 1,
    explain: "Angka atas menunjukkan jumlah ketukan per ruas (4), angka bawah menunjukkan not apa yang dihitung satu ketukan (not seperempat).",
  },
];

function Kuis() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Cek Pemahaman</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Kuis Singkat</h2>
      <p className="text-muted-foreground">
        5 soal pilihan ganda untuk mengecek pemahamanmu sendiri. Pilih satu jawaban, lalu tekan <em>Periksa jawaban</em>. Ini latihan mandiri — untuk penilaian resmi, mintalah gurumu membuka kuis
        pada menu Kuis.
      </p>
      <div className="grid gap-4">
        {KUIS.map((item, i) => (
          <QuizItem key={i} index={i} item={item} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 12. Rangkuman                                                        */
/* ------------------------------------------------------------------ */

const RANGKUMAN: string[] = [
  "Ketukan adalah denyut dasar yang stabil; irama adalah susunan bunyi-diam di atas ketukan.",
  "Pola irama = susunan bunyi-diam yang sama, diulang secara konsisten.",
  "Birama 4/4: empat ketukan per ruas, ketukan pertama terasa paling kuat.",
  "Tanda diam tetap dihitung — jangan pernah dilewati begitu saja.",
  "Mulai berlatih di tempo lambat (50-70 BPM), baru naikkan bertahap setelah stabil.",
  "Karakter bunyi alat (tepuk, kentongan, tamborin, hentakan kaki) memengaruhi seberapa jelas pola terdengar.",
];

function Rangkuman() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Rangkuman</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Yang Perlu Kamu Ingat</h2>
      <ul className="grid gap-2.5 text-sm">
        {RANGKUMAN.map((s) => (
          <li key={s} className="flex gap-2.5 rounded-lg bg-muted p-3">
            <CircleCheck className="size-4.5 shrink-0 text-success" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 13. LKPD HOTS                                                        */
/* ------------------------------------------------------------------ */

const HOTS: { q: string; body: string; explain: string }[] = [
  {
    q: "Menganalisis",
    body: "Notasi berikut diklaim sebagai satu ruas birama 4/4: tepuk (1 ketukan) – tepuk pendek, tepuk pendek (½+½ ketukan) – tepuk (1 ketukan) – diam (1 ketukan) – tepuk (1 ketukan). Jumlahkan nilai notnya. Apakah klaim ini benar?",
    explain: "Jumlah nilainya 1 + 0.5 + 0.5 + 1 + 1 + 1 = 5 ketukan — lebih dari 4. Klaim salah; ada satu bunyi/diam yang harus dibuang supaya pas satu ruas birama 4/4.",
  },
  {
    q: "Menilai",
    body: "Dua kelompok menampilkan Pola C — Irama Jaranan. Kelompok 1 stabil di tempo 80 BPM dari awal sampai akhir. Kelompok 2 mulai di 80 BPM tapi makin cepat setiap putaran. Berdasarkan tiga kriteria — ketepatan bunyi, kestabilan tempo, dan kekompakan kelompok — tampilan mana yang lebih baik, dan mengapa?",
    explain:
      "Kelompok 1 lebih baik pada kriteria kestabilan tempo (tidak rushing) walaupun kedua kelompok mungkin sama-sama tepat membunyikan pola. Tempo yang stabil menunjukkan setiap anggota benar-benar menghitung ketukan, bukan sekadar mengikuti teman di sebelahnya.",
  },
  {
    q: "Mencipta",
    body: "Rancang satu pola irama barumu sendiri untuk birama 4/4, sepanjang satu ruas, memakai minimal satu tanda diam dan minimal satu pasang not seperdelapan. Tuliskan urutan bunyi/diam-nya, lalu coba tepukkan sendiri di tempo 70 BPM.",
    explain:
      "Tidak ada jawaban tunggal — periksa polamu sendiri: apakah total nilainya tepat 4 ketukan? Apakah diam benar-benar terasa (bukan buru-buru)? Bandingkan dengan pola yang paling mirip di Bagian 7 (Latihan Tiru).",
  },
];

function LkpdHots() {
  return (
    <section className="grid gap-5">
      <Eyebrow>LKPD — Penalaran Tingkat Tinggi</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Menganalisis, Menilai, Mencipta</h2>
      <p className="text-muted-foreground">
        Tiga soal dengan satu langkah berpikir lanjut masing-masing: menghitung nilai not, menilai penampilan dengan kriteria, atau merancang penyelesaian sendiri. Kerjakan dulu sebelum menekan{" "}
        <em>Periksa &amp; lihat pembahasan</em>.
      </p>
      <div className="grid gap-4">
        {HOTS.map((item, i) => (
          <div key={item.q} className="rounded-xl bg-muted p-4">
            <p className="mb-2 text-xs font-bold text-primary uppercase">
              Soal {i + 1} · {item.q}
            </p>
            <p className="mb-3 text-sm">{item.body}</p>
            <Reveal title="Periksa & lihat pembahasan">{item.explain}</Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 14. Praktik Ansambel                                                 */
/* ------------------------------------------------------------------ */

function PraktikAnsambel({ materialId, completedInitial, preview }: { materialId: string; completedInitial: boolean; preview?: boolean }) {
  const t = useT();
  const [completed, setCompleted] = useState(completedInitial);
  const [busy, start] = useTransition();

  function mark(value: boolean) {
    if (preview) {
      setCompleted(value);
      toast.info(t("Preview mode — completion isn't saved."));
      return;
    }
    start(async () => {
      const r = await markMaterialCompleted(materialId, value);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setCompleted(value);
      toast.success(r.message);
    });
  }

  return (
    <section className="grid gap-5">
      <Eyebrow>Praktik Akhir</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Tampilkan Berkelompok</h2>
      <p className="text-muted-foreground">
        Gabungkan semua yang sudah dipelajari: pilih satu pola dari Bank Pola (Bagian 6), bagi peran memakai alat yang berbeda-beda (Bagian 8), dan tampilkan bersama kelompokmu.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Sepakati satu pola dan satu tempo untuk seluruh kelompok (mulai dari tempo lambat).</li>
        <li>Bagi anggota: sebagian menepuk pola, sebagian menjaga ketukan dasar dengan hentakan kaki.</li>
        <li>Gunakan metronom di Bagian 3 sebagai penuntun selama tiga putaran pertama, lalu coba tanpa metronom.</li>
        <li>Tampilkan di depan kelas, lalu diskusikan: bagian mana yang paling sulit dijaga tetap stabil?</li>
      </ol>
      <div className="rounded-xl bg-muted p-4">
        {completed ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg bg-success-soft px-4 py-2.5 text-sm font-bold text-success">
              <CircleCheck className="size-5" /> {t("Lessons completed")}
            </span>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => mark(false)}>
              {t("Undo completed mark")}
            </Button>
          </div>
        ) : (
          <Button size="lg" disabled={busy} onClick={() => mark(true)}>
            <CircleCheck /> {t("Mark as completed")}
          </Button>
        )}
      </div>
    </section>
  );
}
