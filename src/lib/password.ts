import { randomInt } from "node:crypto";

// No easily confused characters (0/O, 1/I/l), so a teacher can read a generated password aloud or write it on paper.
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** A random password for an account the teacher creates by hand (shown once, never stored in plain text). */
export function generatePassword(length = 8): string {
  return Array.from({ length }, () => CHARS[randomInt(CHARS.length)]).join("");
}
