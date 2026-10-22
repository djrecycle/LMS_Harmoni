import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily confused letters or digits

/** A fresh, unused classroom invite code. */
export async function newInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = Array.from({ length: 6 }, () => LETTERS[randomInt(LETTERS.length)]).join("");
    const [exists] = await db.select({ id: schema.classroom.id }).from(schema.classroom).where(eq(schema.classroom.inviteCode, code)).limit(1);
    if (!exists) return code;
  }
  throw new Error("Failed to generate an invite code");
}
