import { z } from "zod";

/** A login name for accounts a teacher creates by hand (see the Better Auth `username` plugin config in src/lib/auth.ts). */
export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be 3-24 characters (letters, numbers, underscore)")
  .max(24, "Username must be 3-24 characters (letters, numbers, underscore)")
  .regex(/^[a-z0-9_]+$/, "Username can only use lowercase letters, numbers, and underscore");

/** Lowercase ascii letters/digits only, accents stripped: "Siti Nur'aini" -> ["siti", "nuraini"]. */
function nameWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "Muhammad" and its spellings/abbreviations come first in many names, so they say little about who it is. */
const SKIPPED_PREFIXES = new Set(["muhammad", "muhamad", "mohammad", "mohamad", "mohammed", "mochammad", "mochamad", "muhamed", "moch", "moh", "mohd", "muh", "mhd", "md"]);

/**
 * The short part of a student's username: their first name (max 12 chars). Initials like "M." or "Ni" and
 * "Muhammad" (any spelling) are skipped so "M. Rizky Pratama" and "Muhammad Rizky Pratama" both give "rizky".
 * A name that is only "Muhammad" keeps it; falls back to "siswa" when no word has 3+ characters.
 */
export function firstNameBase(name: string): string {
  const words = nameWords(name).filter((w) => w.length >= 3);
  return (words.find((w) => !SKIPPED_PREFIXES.has(w)) ?? words[0] ?? "siswa").slice(0, 12);
}

/** First name + underscore + number, e.g. "rizky_27". `digits` grows when the 2-digit numbers run out. */
export function shortUsername(name: string, random: () => number = Math.random, digits = 2): string {
  const min = 10 ** (digits - 1);
  const n = min + Math.floor(random() * (10 ** digits - min));
  return `${firstNameBase(name)}_${n}`;
}
