import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ALLOWED_MIME, saveFile } from "@/lib/storage";
import { getT } from "@/i18n/server";

export const runtime = "nodejs";

const LIMIT_MEDIA_MB = Number(process.env.MAX_UPLOAD_MB ?? 50);
const RECORDING_LIMIT_MB = 20;

/**
 * Upload a file.
 *  - teacher -> category "media"     (image / audio / video, for lessons and questions)
 *  - student -> category "recordings" (practice recording audio, stored in the student's own folder)
 */
export async function POST(req: Request) {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("Please sign in first.") }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: t("Invalid upload data.") }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: t("File not found.") }, { status: 400 });
  }

  const category = user.role === "teacher" ? "media" : "recording";
  const limit = (category === "media" ? LIMIT_MEDIA_MB : RECORDING_LIMIT_MB) * 1024 * 1024;
  if (file.size > limit) {
    return NextResponse.json(
      { error: t("Maximum file size is {0} MB.", category === "media" ? LIMIT_MEDIA_MB : RECORDING_LIMIT_MB) },
      { status: 413 },
    );
  }

  // Determine the extension from the MIME type (not the file name), then match it against the allowed list.
  const ALIAS: Record<string, string> = {
    "audio/mp3": "audio/mpeg",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/x-m4a": "audio/mp4",
    "audio/x-flac": "audio/flac",
  };
  const raw = file.type.split(";")[0].trim().toLowerCase();
  const mime = ALIAS[raw] ?? raw;
  const ext = Object.entries(ALLOWED_MIME).find(([e, m]) => m === mime && !["jpeg", "m4v", "oga"].includes(e))?.[0];
  if (!ext) {
    return NextResponse.json({ error: t("File type not supported ({0}).", mime || "unknown") }, { status: 415 });
  }
  if (category === "recording" && !mime.startsWith("audio/") && mime !== "video/webm") {
    return NextResponse.json({ error: t("Students may only upload audio recordings.") }, { status: 415 });
  }

  const key =
    category === "media"
      ? `media/${user.id}/${randomUUID()}.${ext}`
      : `recording/${user.id}/${randomUUID()}.${ext}`;
  await saveFile(key, Buffer.from(await file.arrayBuffer()), ALLOWED_MIME[ext]);

  return NextResponse.json({ key, url: `/api/files/${key}`, mime: ALLOWED_MIME[ext], size: file.size });
}
