import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encrypt small secrets (API keys) before they go into the database: AES-256-GCM with a key derived from
 * BETTER_AUTH_SECRET. Whoever holds the database AND that secret can read them, the same as holding the .env file.
 * Changing BETTER_AUTH_SECRET makes stored secrets undecryptable (decrypt returns null) — enter them again.
 */
const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "", "harmoni-settings-v1", 32));
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [VERSION, iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** The original text, or null when the value is missing, malformed, or was encrypted with another secret. */
export function decryptSecret(stored: unknown): string | null {
  if (typeof stored !== "string") return null;
  const [v, iv, tag, data] = stored.split(":");
  if (v !== VERSION || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
