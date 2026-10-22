import "./_env";
import { crc32, deflateSync } from "node:zlib";
import { eq } from "drizzle-orm";
import type { AnswerKey } from "../src/lib/questions";

const PASSWORD = "harmoni123";

/* ---------- Sample asset generators (WAV & PNG) without dependencies ---------- */

function wav(note: { hz: number; dur: number }[]): Buffer {
  const rate = 22050;
  const samples: number[] = [];
  for (const { hz, dur } of note) {
    const n = Math.floor(rate * dur);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 400) * Math.min(1, (n - i) / 2000) * Math.exp(-i / (rate * dur * 1.2));
      samples.push(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 0.55 * env * 32767));
    }
  }
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Simple PNG: a 5-line staff with one note (ellipse) at the given position. */
function pngStaff(position: number): Buffer {
  const W = 420, H = 170, top = 45, distance = 20;
  const px = Buffer.alloc((W * 3 + 1) * H, 255);
  const set = (x: number, y: number, v = 20) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = y * (W * 3 + 1) + 1 + x * 3;
    px[o] = v; px[o + 1] = v; px[o + 2] = v + 10;
  };
  for (let y = 0; y < H; y++) px[y * (W * 3 + 1)] = 0;
  for (let g = 0; g < 5; g++) for (let x = 30; x < W - 30; x++) { set(x, top + g * distance); set(x, top + g * distance + 1); }
  const cy = top + 4 * distance - (position * distance) / 2; // position 0 = line 1 (paling bottom), 1 = space 1, dst.
  const cx = 230;
  for (let y = -11; y <= 11; y++) for (let x = -14; x <= 14; x++) if ((x * x) / 196 + (y * y) / 121 <= 1) set(cx + x, Math.round(cy) + y);
  for (let y = -50; y <= 0; y++) { set(cx + 13, Math.round(cy) + y); set(cx + 14, Math.round(cy) + y); }
  const chunk = (type: string, d: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), d])) >>> 0);
    return Buffer.concat([len, Buffer.from(type), d, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(px)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */

async function main() {
  const { db, schema, closeDb, dbMode } = await import("../src/db");
  const { runMigrations } = await import("../src/db/migrate");
  const { auth, signupContext } = await import("../src/lib/auth");
  const { saveFile } = await import("../src/lib/storage");
  const { gradeAnswer } = await import("../src/lib/questions");
  const { finishAttempt } = await import("../src/lib/grading");
  const { today } = await import("../src/lib/utils");
  const S = schema;

  await runMigrations();

  const done = await db.select({ id: S.user.id }).from(S.user).limit(1);
  if (done.length) {
    console.log("The database already has data, seed skipped. (To start over locally: npm run db:reset, then npm run db:seed)");
    await closeDb();
    return;
  }

  const createAccount = async (name: string, email: string, role: "teacher" | "student") => {
    await signupContext.run({ role }, () => auth.api.signUpEmail({ body: { name: name, email, password: PASSWORD } }));
    const [u] = await db.select().from(S.user).where(eq(S.user.email, email));
    return u;
  };

  console.log("Creating accounts…");
  const teacher = await createAccount("Ms. Sari Wulandari", "teacher@harmoni.test", "teacher");
  const studentName = ["Andi Pratama", "Bunga Lestari", "Citra Dewi", "Dimas Saputra", "Eka Putri"];
  const student = [];
  for (let i = 0; i < studentName.length; i++) student.push(await createAccount(studentName[i], `student${i + 1}@harmoni.test`, "student"));

  const [classroom] = await db
    .insert(S.classroom)
    .values({ name: "Music Class 7A", description: "A sample class for trying every feature.", inviteCode: "MUSIC7A", teacherId: teacher.id })
    .returning();
  await db.insert(S.classroomMembership).values(student.map((s) => ({ classroomId: classroom.id, studentId: s.id })));

  /* ---------- Assets ---------- */
  const assetKey = (name: string, ext: string) => `media/${teacher.id}/seed-${name}.${ext}`;
  const asset = {
    a4: assetKey("note-a4", "wav"),
    arpeggio: assetKey("arpeggio-c", "wav"),
    staf: assetKey("staff-space2", "png"),
  };
  await saveFile(asset.a4, wav([{ hz: 440, dur: 2 }]), "audio/wav");
  await saveFile(asset.arpeggio, wav([{ hz: 261.63, dur: 0.6 }, { hz: 329.63, dur: 0.6 }, { hz: 392, dur: 0.9 }]), "audio/wav");
  await saveFile(asset.staf, pngStaff(3), "image/png"); // 3 = second space from the bottom

  /* ---------- Materials ---------- */
  const date = (offset: number) => {
    const d = new Date(today() + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const materialList = [
    {
      title: "Scales and Staff Notation",
      topic: "Music Theory",
      offset: -5,
      typeMedia: "audio" as const,
      mediaKey: asset.arpeggio,
      content: "# Scales and Staff Notation\n\nMusic is written on a **staff**: five lines and four spaces. Notes sit on a line or in a space to show how high or low they are.\n\n## The C Major Scale\n\nIt has seven notes: **C – D – E – F – G – A – B**, then back to C.\n\n- No sharps or flats\n- All white keys on the piano\n\n> Listen to the audio above, then play C-E-G under **Practice → Virtual Piano**.",
    },
    {
      title: "Tempo and Dynamics",
      topic: "Music Theory",
      offset: -2,
      typeMedia: "text" as const,
      mediaKey: null,
      content: "# Tempo and Dynamics\n\n**Tempo** is how fast or slow a piece is, measured in *BPM* (beats per minute).\n\n| Term | Meaning |\n|---|---|\n| Largo | Very slow |\n| Andante | At a walking pace |\n| Allegro | Fast and lively |\n\n**Dynamics** is how loud or soft the music is: *piano (p)* is soft, *forte (f)* is loud, *crescendo* means getting louder.",
    },
    {
      title: "4/4 Time and Rhythm Patterns",
      topic: "Rhythm",
      offset: 0,
      typeMedia: "text" as const,
      mediaKey: null,
      content: "# 4/4 Time\n\n4/4 means **four beats** in one bar, and each beat is a quarter note.\n\nCount: **1 – 2 – 3 – 4**. The first beat is usually the strongest.\n\n## Today's task\n\n1. Clap the rhythm *ta – ta – ti-ti – ta*.\n2. Try it under **Practice → Rhythm** and see your score.",
    },
    {
      title: "Traditional Instruments of the Archipelago",
      topic: "Indonesian Music",
      offset: 3,
      typeMedia: "text" as const,
      mediaKey: null,
      content: "# Traditional Instruments\n\nThis lesson will be published in a few days. You will learn about the angklung, gamelan, sasando, and kolintang.",
    },
  ];
  const materialRows = await db
    .insert(S.material)
    .values(materialList.map(({ offset: _o, ...m }) => ({ ...m, teacherId: teacher.id })))
    .returning();
  await db.insert(S.classroomMaterial).values(materialRows.map((m, i) => ({ materialId: m.id, classroomId: classroom.id, date: date(materialList[i].offset) })));

  /* ---------- Question bank ---------- */
  type Seed = {
    type: "multiple_choice" | "fill_in" | "true_false" | "audio" | "video" | "midi";
    answerType: "multiple_choice" | "fill_in" | "true_false" | "midi";
    prompt: string;
    mediaKey?: string;
    options?: string[];
    answerKey: AnswerKey;
    explanation?: string;
    topic: string;
    points?: number;
  };
  const questionList: Seed[] = [
    { type: "multiple_choice", answerType: "multiple_choice", prompt: "How many beats are there in one bar of 4/4?", options: ["2", "3", "4", "6"], answerKey: { kind: "multiple_choice", correct: 2 }, explanation: "The top number of a time signature is the number of beats per bar.", topic: "Rhythm" },
    { type: "multiple_choice", answerType: "multiple_choice", prompt: "The notes of the C major scale are…", options: ["C D E F G A B", "C D E♭ F G A B♭", "C E G B D F A", "C C# D D# E F F#"], answerKey: { kind: "multiple_choice", correct: 0 }, explanation: "C major only uses white keys: C D E F G A B.", topic: "Music Theory" },
    { type: "true_false", answerType: "true_false", prompt: "The dynamic marking *forte* means to play softly.", answerKey: { kind: "true_false", correct: false }, explanation: "Forte (f) means loud. Soft is piano (p).", topic: "Music Theory" },
    { type: "fill_in", answerType: "fill_in", prompt: "The traditional West Javanese bamboo instrument that is played by shaking it is called the…", answerKey: { kind: "fill_in", answer: ["angklung"] }, explanation: "The angklung is recognized by UNESCO as an Intangible Cultural Heritage.", topic: "Indonesian Music" },
    { type: "multiple_choice", answerType: "multiple_choice", prompt: "Look at the staff image below. The note is on…", mediaKey: asset.staf, options: ["The first line", "The second space", "The third line", "The fourth space"], answerKey: { kind: "multiple_choice", correct: 1 }, explanation: "Count from the bottom: line 1, space 1, line 2, space 2. The note is on the second space.", topic: "Music Theory" },
    { type: "audio", answerType: "multiple_choice", prompt: "Listen to the clip. Which note do you hear?", mediaKey: asset.a4, options: ["C", "E", "G", "A"], answerKey: { kind: "multiple_choice", correct: 3 }, explanation: "440 Hz is the note A, the standard tuning reference.", topic: "Ear Training" },
    { type: "audio", answerType: "fill_in", prompt: "Listen to the clip. How many different notes are played in a row?", mediaKey: asset.arpeggio, answerKey: { kind: "fill_in", answer: ["3", "three"] }, explanation: "The clip plays C, E, then G.", topic: "Ear Training" },
    { type: "midi", answerType: "midi", prompt: "Play the C major scale going up, from C to the C an octave higher.", answerKey: { kind: "midi", note: ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"], mode: "ordered", ignoreOctave: false, playExample: false }, explanation: "All white keys from C4 to C5.", topic: "Piano" },
    { type: "midi", answerType: "midi", prompt: "Press a C major chord (the notes C, E and G). Any order.", answerKey: { kind: "midi", note: ["C4", "E4", "G4"], mode: "chord", ignoreOctave: true, playExample: false }, explanation: "A C major chord is built from C, E, G.", topic: "Piano" },
    { type: "midi", answerType: "midi", prompt: "Listen to the example melody, then repeat it on the piano keys.", answerKey: { kind: "midi", note: ["E4", "E4", "F4", "G4", "G4", "F4", "E4", "D4"], mode: "ordered", ignoreOctave: false, playExample: true }, explanation: "This is the opening of Beethoven's “Ode to Joy”.", topic: "Piano" },
    { type: "fill_in", answerType: "fill_in", prompt: "Explain in your own words what dynamics means in music, and give one example term.", answerKey: { kind: "fill_in", answer: [] }, explanation: "Graded by the teacher. A good answer mentions loud vs. soft and an example such as forte/piano.", topic: "Music Theory", points: 2 },
  ];
  const questionRows = await db
    .insert(S.question)
    .values(
      questionList.map((s) => ({
        teacherId: teacher.id,
        type: s.type,
        answerType: s.answerType,
        prompt: s.prompt,
        mediaKey: s.mediaKey ?? null,
        options: s.options ?? null,
        answerKey: s.answerKey,
        explanation: s.explanation ?? null,
        topic: s.topic,
        points: s.points ?? 1,
      })),
    )
    .returning();

  /* ---------- Quiz ---------- */
  const [quiz1, quiz2] = await db
    .insert(S.quiz)
    .values([
      { teacherId: teacher.id, classroomId: classroom.id, title: "Quiz 1: Music Theory Basics", description: "Rhythm, scales, and dynamics terms.", published: true, maxAttempts: 2, instantFeedback: true },
      { teacherId: teacher.id, classroomId: classroom.id, title: "Quiz 2: Ears & Fingers", description: "Listen, then play on the virtual piano.", published: true, maxAttempts: 3, instantFeedback: true, durationMinutes: 15 },
    ])
    .returning();
  const idx = (...n: number[]) => n.map((i) => questionRows[i].id);
  await db.insert(S.quizQuestion).values([
    ...idx(0, 1, 2, 3, 4, 10).map((questionId, position) => ({ quizId: quiz1.id, questionId, position })),
    ...idx(5, 6, 7, 8, 9).map((questionId, position) => ({ quizId: quiz2.id, questionId, position })),
  ]);

  /* ---------- Sample attempts ---------- */
  const correctAnswer = (i: number): unknown => {
    const k = questionList[i].answerKey;
    switch (k.kind) {
      case "multiple_choice": case "true_false": return k.correct;
      case "fill_in": return k.answer[0] ?? "Dynamics is how loud or soft the sound is, for example forte and piano.";
      case "midi": return k.note;
    }
  };
  const wrongAnswer = (i: number): unknown => {
    const k = questionList[i].answerKey;
    switch (k.kind) {
      case "multiple_choice": return (k.correct + 1) % (questionList[i].options?.length ?? 2);
      case "true_false": return !k.correct;
      case "fill_in": return k.answer.length ? "no idea" : "Dynamics is about music.";
      case "midi": return [...k.note].reverse();
    }
  };
  const take = async (studentId: string, quizId: string, questionIndex: number[], correctAll: boolean[], start: Date) => {
    const [p] = await db.insert(S.attempt).values({ quizId, studentId, startedAt: start }).returning();
    for (let n = 0; n < questionIndex.length; n++) {
      const i = questionIndex[n];
      const answer = correctAll[n] ? correctAnswer(i) : wrongAnswer(i);
      const points = questionList[i].points ?? 1;
      const h = gradeAnswer(questionList[i].answerKey, answer, points);
      await db.insert(S.answer).values({ attemptId: p.id, questionId: questionRows[i].id, answer: answer as never, correct: h.correct, score: h.score, maxScore: points });
    }
    await finishAttempt(p.id);
  };
  const yesterday = new Date(Date.now() - 86400_000);
  const threeHoursAgo = new Date(Date.now() - 3600_000 * 3);
  const k1 = [0, 1, 2, 3, 4, 10];
  await take(student[0].id, quiz1.id, k1, [true, true, true, true, true, true], yesterday);
  await take(student[1].id, quiz1.id, k1, [true, true, false, true, false, true], yesterday);
  await take(student[2].id, quiz1.id, k1, [true, false, false, true, true, false], threeHoursAgo);
  await take(student[0].id, quiz2.id, [5, 6, 7, 8, 9], [true, true, true, true, false], threeHoursAgo);

  await db.insert(S.materialProgress).values([
    { studentId: student[0].id, materialId: materialRows[0].id, completed: true, completedAt: yesterday },
    { studentId: student[0].id, materialId: materialRows[1].id, completed: true, completedAt: threeHoursAgo },
    { studentId: student[1].id, materialId: materialRows[0].id, completed: true, completedAt: yesterday },
    { studentId: student[2].id, materialId: materialRows[0].id, completed: false },
  ]);
  await db.insert(S.practiceResult).values([
    { studentId: student[0].id, kind: "rhythm", title: "Rhythm: Basic beats (80 BPM)", score: 88, detail: { bpm: 80 } },
    { studentId: student[0].id, kind: "note", title: "Repeat 3 notes", score: 100 },
  ]);

  console.log(`
Seed completed (${dbMode === "pglite" ? "local PGlite" : "PostgreSQL"}).

  Teacher  : teacher@harmoni.test      / ${PASSWORD}
  Students : student1@harmoni.test .. student5@harmoni.test / ${PASSWORD}
  Class    : ${classroom.name}  (invite code: ${classroom.inviteCode})
`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
