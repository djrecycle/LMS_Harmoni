"use client";

import { useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { markMaterialCompleted } from "@/app/actions/material";
import { MelodyComposer } from "@/components/melody-composer";
import { PianoRoll } from "@/components/piano-roll";
import { StaffNotation } from "@/components/staff-notation";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { melodyFromSteps, type MelodyBlockData } from "@/lib/music-blocks";
import { Eyebrow, LessonTabs, QuizItem, Reveal, type MCQ } from "./shared";

const SECTIONS = ["Sampul", "Mengenal Nada", "Membaca Piano Roll", "Dari Klik ke Notasi", "Menulis Melodi", "Tantangan", "Studi Kasus", "Kuis", "Rangkuman", "Karya Akhir"] as const;

/** "Menulis Melodi dengan Piano Roll" — Seni Musik, Kelas VIII. Registered as slug "menulis-melodi-piano-roll". */
export function MenulisMelodiPianoRoll({ materialId, completedInitial, preview }: { materialId: string; completedInitial: boolean; preview?: boolean }) {
  const [active, setActive] = useState(0);
  const go = (i: number) => setActive(Math.max(0, Math.min(SECTIONS.length - 1, i)));

  return (
    <div className="grid gap-6">
      <LessonTabs labels={[...SECTIONS]} active={active} onSelect={go} label="Bagian materi" />
      <p className="text-xs font-semibold text-muted-foreground">
        Bagian {active + 1} dari {SECTIONS.length}
      </p>

      <div className="rounded-2xl border bg-card p-5 shadow-xs sm:p-7">
        {active === 0 && <Sampul onStart={() => go(1)} onQuiz={() => go(7)} />}
        {active === 1 && <MengenalNada />}
        {active === 2 && <MembacaPianoRoll />}
        {active === 3 && <DariKlikKeNotasi />}
        {active === 4 && <MenulisMelodi />}
        {active === 5 && <Tantangan materialId={materialId} preview={preview} />}
        {active === 6 && <StudiKasus />}
        {active === 7 && <Kuis />}
        {active === 8 && <Rangkuman />}
        {active === 9 && <KaryaAkhir materialId={materialId} completedInitial={completedInitial} preview={preview} />}
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
/* 1. Sampul                                                            */
/* ------------------------------------------------------------------ */

function Sampul({ onStart, onQuiz }: { onStart: () => void; onQuiz: () => void }) {
  return (
    <section className="grid gap-5">
      <Eyebrow>Materi Pembelajaran Interaktif</Eyebrow>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Menulis Melodi dengan Piano Roll</h2>
      <p className="text-lg text-muted-foreground italic">
        Selama ini kamu sudah belajar menuliskan <em>ritme</em> — kapan bunyi dan kapan diam. Sekarang saatnya menuliskan <em>nada</em>: bunyi yang mana. Klik kotak di piano roll, dan notasi
        baloknya langsung muncul di hadapanmu.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-primary uppercase">Tujuan Pembelajaran</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Menjelaskan hubungan antara posisi pada piano roll dan posisi not pada garis paranada.</li>
            <li>Menuliskan melodi sederhana (bukan hanya ritme) menggunakan piano roll interaktif.</li>
            <li>Membaca notasi balok hasil tulisannya sendiri dan membandingkannya dengan melodi contoh.</li>
          </ol>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-primary uppercase">Yang Kamu Butuhkan</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>Perangkat dengan speaker/headset agar bisa mendengarkan hasil tulisanmu.</li>
            <li>Pemahaman dasar ketukan dan nilai not (lihat materi &quot;Pola Irama &amp; Ritme Sederhana&quot;).</li>
            <li>Kemauan untuk mencoba — tidak ada melodi yang &quot;salah&quot; selain di bagian Tantangan.</li>
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
/* 2. Mengenal Nada                                                     */
/* ------------------------------------------------------------------ */

function Konsep({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-1.5 font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function MengenalNada() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Bagian 1</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Nada, Garis Paranada, dan Kunci G</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Konsep title="Nada (pitch)">Tinggi-rendahnya sebuah bunyi. Semakin ke kanan pada piano (atau semakin ke atas pada piano roll), semakin tinggi nadanya.</Konsep>
        <Konsep title="Garis paranada">
          Lima garis dan empat spasi tempat not digambar. Makin tinggi letak not pada garis paranada, makin tinggi nadanya — persis seperti piano roll.
        </Konsep>
        <Konsep title="Kunci G (treble clef)">Simbol di awal garis paranada yang menjadi acuan: lengkungnya melingkari garis kedua, yang berarti garis itu adalah nada G4.</Konsep>
        <Konsep title="Garis bantu (ledger line)">Garis pendek tambahan untuk not yang terlalu tinggi atau rendah untuk muat di lima garis utama, misalnya C4 (not do tengah).</Konsep>
      </div>
      <div className="rounded-xl bg-muted p-5">
        <p className="mb-3 text-xs font-bold text-muted-foreground uppercase">Tangga nada C mayor — Do Re Mi Fa Sol La Si Do</p>
        <StaffNotation {...melodyFromSteps([60, 62, 64, 65, 67, 69, 71, 72], "quarter")} />
        <p className="mt-3 text-sm text-muted-foreground">
          Perhatikan: semakin tinggi notnya (C4 → C5), semakin tinggi pula letaknya pada garis paranada. Not pertama (C4/&quot;Do&quot;) memakai garis bantu karena posisinya di bawah garis utama.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Membaca Piano Roll                                                */
/* ------------------------------------------------------------------ */

function MembacaPianoRoll() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Bagian 2</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Membaca Piano Roll</h2>
      <p className="text-muted-foreground">
        Piano roll adalah kisi-kisi (grid): sumbu <strong>mendatar</strong> adalah waktu (dibagi menjadi langkah-langkah kecil yang sama panjang), dan sumbu <strong>tegak</strong> adalah tinggi
        nada — persis seperti tuts piano yang didirikan ke atas. Satu kotak yang kamu klik = satu not pada nada dan waktu itu. Kotak yang dibiarkan kosong berarti diam (istirahat).
      </p>
      <div className="rounded-xl bg-muted p-5">
        <p className="mb-3 text-xs font-bold text-muted-foreground uppercase">Contoh: melodi naik bertahap</p>
        <PianoRoll {...melodyFromSteps([60, 62, 64, 65, 67, null, null, null], "quarter")} />
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Konsep title="Kotak lebih ke atas">Nada lebih tinggi — sama seperti tuts piano yang lebih ke kanan.</Konsep>
        <Konsep title="Kotak lebih ke kanan">Dibunyikan belakangan — sama seperti pada pola irama yang sudah kamu pelajari.</Konsep>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Dari Klik ke Notasi                                               */
/* ------------------------------------------------------------------ */

function DariKlikKeNotasi() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Bagian 3</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Dari Klik ke Notasi Balok</h2>
      <p className="text-muted-foreground">
        Setiap kali kamu mengeklik sebuah kotak pada piano roll, aplikasi ini langsung menggambarkan not yang sama pada garis paranada di bawahnya. Posisinya otomatis benar — kamu tidak perlu
        menghitung sendiri garis dan spasinya.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-muted p-4">
          <p className="mb-2 text-xs font-bold text-muted-foreground uppercase">Melodi turun: Sol-Fa-Mi-Re-Do</p>
          <PianoRoll {...melodyFromSteps([67, 65, 64, 62, 60, null, null, null], "quarter")} />
          <div className="mt-3 rounded-lg border bg-card p-2">
            <StaffNotation {...melodyFromSteps([67, 65, 64, 62, 60, null, null, null], "quarter")} />
          </div>
        </div>
        <div className="rounded-xl bg-muted p-4">
          <p className="mb-2 text-xs font-bold text-muted-foreground uppercase">Melodi dengan lompatan: Do-Sol-Do-Sol</p>
          <PianoRoll {...melodyFromSteps([60, 67, 60, 67, null, null, null, null], "quarter")} />
          <div className="mt-3 rounded-lg border bg-card p-2">
            <StaffNotation {...melodyFromSteps([60, 67, 60, 67, null, null, null, null], "quarter")} />
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Bandingkan keduanya: melodi yang bergerak selangkah demi selangkah (seperti tangga nada) terlihat seperti garis yang halus pada notasi balok, sedangkan melodi dengan lompatan jaraknya
        terlihat jauh lebih lebar. Coba dengarkan keduanya dengan tombol <em>Listen</em> pada piano roll di atas.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Menulis Melodi (latihan bebas)                                    */
/* ------------------------------------------------------------------ */

function MenulisMelodi() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Praktik</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Giliranmu Menulis Melodi</h2>
      <p className="text-muted-foreground">
        Klik kotak-kotak pada piano roll di bawah untuk menulis melodimu sendiri. Perhatikan notasi baloknya berubah mengikuti setiap klik. Tekan <em>Listen</em> kapan saja untuk mendengarkan
        hasilnya.
      </p>
      <MelodyComposer />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Tantangan: Tulis Ulang Melodi                                     */
/* ------------------------------------------------------------------ */

const TARGET_MELODY: MelodyBlockData = melodyFromSteps([60, 60, 67, 67, 69, 69, 67, null], "quarter");

function Tantangan({ materialId, preview }: { materialId: string; preview?: boolean }) {
  return (
    <section className="grid gap-5">
      <Eyebrow>Tantangan</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Tulis Ulang Melodi Ini</h2>
      <p className="text-muted-foreground">
        Dengarkan contoh melodi berikut (awal lagu &quot;Bintang Kecil&quot;/&quot;Twinkle Twinkle&quot;), lalu tuliskan ulang persis sama pada piano roll kosong di bawahnya.
      </p>
      <div className="rounded-xl bg-muted p-4">
        <p className="mb-2 text-xs font-bold text-muted-foreground uppercase">Contoh (dengarkan dulu)</p>
        <PianoRoll {...TARGET_MELODY} />
      </div>
      <div>
        <p className="mb-2 text-xs font-bold text-muted-foreground uppercase">Tulis ulang di sini</p>
        <MelodyComposer target={TARGET_MELODY} saveResult={!preview} materialId={materialId} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Studi Kasus                                                       */
/* ------------------------------------------------------------------ */

function StudiKasus() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Studi Kasus</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Melodi Doni Terdengar Aneh</h2>
      <div className="rounded-xl bg-muted p-5 text-sm leading-relaxed">
        <p>
          Doni ingin menulis melodi tangga nada C mayor yang naik halus dari Do ke Do berikutnya, tapi saat didengarkan ada satu nada yang terasa &quot;melompat&quot; jauh dibanding yang lain,
          padahal dia yakin sudah mengklik kotak satu per satu tanpa melompati baris.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <PianoRoll {...melodyFromSteps([60, 62, 64, 65, 69, null, null, null], "quarter")} />
      </div>
      <div className="grid gap-2">
        <p className="font-bold">Coba analisis:</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Not keberapa yang posisinya tidak sesuai dengan tangga nada C mayor naik bertahap (Do-Re-Mi-Fa-Sol)?</li>
          <li>Pada piano roll, ciri apa yang membedakan &quot;melangkah bertahap&quot; dengan &quot;melompat&quot;?</li>
          <li>Apa yang harus diklik Doni untuk memperbaikinya?</li>
        </ol>
      </div>
      <Reveal title="Lihat pembahasan singkat">
        Not kelima seharusnya G4 (Sol), tapi yang tertulis A4 — baris yang diklik Doni melompat satu baris terlalu tinggi. Pada piano roll, melangkah bertahap terlihat sebagai baris-baris yang
        bersebelahan dan bergeser satu-satu; melompat terlihat sebagai jarak baris yang lebih dari satu. Perbaikannya: hapus not di A4 pada langkah kelima, lalu klik ulang satu baris di
        bawahnya (G4).
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Kuis                                                              */
/* ------------------------------------------------------------------ */

const KUIS: MCQ[] = [
  {
    q: "Pada piano roll, apa arti sebuah kotak yang diklik lebih ke ATAS dibandingkan kotak lainnya?",
    options: ["Nadanya lebih rendah", "Nadanya lebih tinggi", "Bunyinya lebih keras", "Bunyinya lebih panjang"],
    correct: 1,
    explain: "Sumbu tegak pada piano roll adalah tinggi nada — makin ke atas, makin tinggi nadanya, sama seperti tuts piano yang makin ke kanan.",
  },
  {
    q: "Apa perbedaan utama antara blok ritme (yang sudah kamu pelajari sebelumnya) dan piano roll?",
    options: [
      "Piano roll hanya untuk alat musik elektronik",
      "Blok ritme menentukan kapan bunyi/diam, piano roll juga menentukan nada mana yang dibunyikan",
      "Piano roll tidak bisa didengarkan",
      "Keduanya persis sama",
    ],
    correct: 1,
    explain: "Blok ritme hanya mencatat pola bunyi-diam tanpa nada. Piano roll menambahkan sumbu nada, sehingga kamu bisa menuliskan melodi, bukan hanya ritmenya.",
  },
  {
    q: "Pada notasi balok, apa fungsi garis bantu (ledger line)?",
    options: [
      "Menghubungkan dua not yang berjauhan waktunya",
      "Menunjukkan not yang terlalu tinggi atau rendah untuk muat di lima garis utama",
      "Menandai not yang harus dimainkan lebih keras",
      "Mengganti fungsi kunci G",
    ],
    correct: 1,
    explain: "Garis bantu adalah garis pendek tambahan di atas atau di bawah lima garis utama, dipakai untuk not seperti C4 yang posisinya di luar jangkauan garis utama.",
  },
  {
    q: "Sebuah melodi berpindah dari Do (C4) langsung ke Sol (G4). Bagaimana ini terlihat pada piano roll dibandingkan melodi yang bergerak Do-Re-Mi secara bertahap?",
    options: ["Jarak antar barisnya jauh lebih lebar", "Jarak antar barisnya sama saja", "Tidak bisa dibedakan dari piano roll", "Hanya bisa dibedakan dari notasi balok"],
    correct: 0,
    explain: "Lompatan nada (interval besar) terlihat sebagai jarak antar baris yang lebar pada piano roll, sementara gerakan bertahap terlihat sebagai baris-baris yang bersebelahan.",
  },
];

function Kuis() {
  return (
    <section className="grid gap-5">
      <Eyebrow>Cek Pemahaman</Eyebrow>
      <h2 className="text-2xl font-extrabold sm:text-3xl">Kuis Singkat</h2>
      <p className="text-muted-foreground">
        4 soal pilihan ganda untuk mengecek pemahamanmu sendiri. Pilih satu jawaban, lalu tekan <em>Periksa jawaban</em>. Ini latihan mandiri — untuk penilaian resmi, mintalah gurumu membuka
        kuis pada menu Kuis.
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
/* 9. Rangkuman                                                         */
/* ------------------------------------------------------------------ */

const RANGKUMAN: string[] = [
  "Piano roll menambahkan sumbu nada pada pola ritme: mendatar = waktu, tegak = tinggi nada.",
  "Makin tinggi letak kotak yang diklik, makin tinggi pula letak not pada garis paranada — keduanya selalu sejalan.",
  "Garis bantu (ledger line) dipakai untuk not yang posisinya di luar lima garis paranada utama, misalnya C4.",
  "Gerakan nada bertahap (Do-Re-Mi) terlihat sebagai baris-baris yang bersebelahan; lompatan nada terlihat sebagai jarak baris yang lebar.",
  "Dengan piano roll, kamu bisa menuliskan melodi penuh — bukan hanya ritmenya — lalu langsung mendengarkan dan membaca notasi baloknya.",
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
/* 10. Karya Akhir                                                      */
/* ------------------------------------------------------------------ */

function KaryaAkhir({ materialId, completedInitial, preview }: { materialId: string; completedInitial: boolean; preview?: boolean }) {
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
      <h2 className="text-2xl font-extrabold sm:text-3xl">Komposisikan Melodimu Sendiri</h2>
      <p className="text-muted-foreground">
        Gunakan semua yang sudah kamu pelajari untuk menulis satu melodi pendek orisinal (minimal 8 langkah), lalu dengarkan hasilnya dan perhatikan notasi baloknya. Tidak ada jawaban benar atau
        salah di sini — ini karyamu sendiri.
      </p>
      <MelodyComposer />
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
