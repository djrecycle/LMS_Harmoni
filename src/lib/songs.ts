/**
 * Songs for the "Play a Song" piano mode (falling notes). Public-domain melodies, right hand only.
 *  Written as text: "C4:1 E4:0.5 R:1", each token = note:beats (R = rest; beats default to 1).
 */
import { noteToMidi } from "./music";

export type SongNote = { midi: number; start: number; beats: number };
export type Song = { id: string; title: string; level: 1 | 2 | 3; bpm: number; notes: SongNote[] };

type SongSource = { id: string; title: string; level: 1 | 2 | 3; bpm: number; melody: string };

const SOURCES: SongSource[] = [
  {
    id: "c-major",
    title: "C Major Scale",
    level: 1,
    bpm: 90,
    melody: "C4 D4 E4 F4 G4 A4 B4 C5:2 B4 A4 G4 F4 E4 D4 C4:2",
  },
  {
    id: "twinkle",
    title: "Twinkle Twinkle Little Star",
    level: 1,
    bpm: 100,
    melody: `C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2
      G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2
      C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2`,
  },
  {
    id: "mary",
    title: "Mary Had a Little Lamb",
    level: 1,
    bpm: 110,
    melody: "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4",
  },
  {
    id: "ode-to-joy",
    title: "Ode to Joy (Beethoven)",
    level: 2,
    bpm: 100,
    melody: `E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2
      E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2`,
  },
  {
    id: "happy-birthday",
    title: "Happy Birthday",
    level: 2,
    bpm: 100,
    melody: `G4:0.75 G4:0.25 A4 G4 C5 B4:2 G4:0.75 G4:0.25 A4 G4 D5 C5:2
      G4:0.75 G4:0.25 G5 E5 C5 B4 A4:2 F5:0.75 F5:0.25 E5 C5 D5 C5:3`,
  },
  {
    id: "jingle-bells",
    title: "Jingle Bells",
    level: 2,
    bpm: 120,
    melody: `E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4
      F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2
      E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4
      F4 F4 F4 F4 F4 E4 E4 E4:0.5 E4:0.5 G4 G4 F4 D4 C4:4`,
  },
  {
    id: "fur-elise",
    title: "Für Elise (Beethoven)",
    level: 3,
    bpm: 72,
    melody: `E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1
      R:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 R:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1
      R:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1
      R:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 R:0.5 E4:0.5 C5:0.5 B4:0.5 A4:2`,
  },
];

function parseMelody(text: string): SongNote[] {
  const notes: SongNote[] = [];
  let t = 0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const [name, len] = token.split(":");
    const beats = len ? Number(len) : 1;
    if (name !== "R") {
      const midi = noteToMidi(name);
      if (midi === null) throw new Error(`Invalid note in song: ${token}`);
      notes.push({ midi, start: t, beats });
    }
    t += beats;
  }
  return notes;
}

export const SONGS: Song[] = SOURCES.map(({ melody, ...s }) => ({ ...s, notes: parseMelody(melody) }));

export const songLength = (song: Song) => Math.max(...song.notes.map((n) => n.start + n.beats));
