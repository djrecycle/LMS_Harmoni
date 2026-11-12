import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ROOT = process.env.UPLOAD_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");
const useS3 = () => process.env.STORAGE_DRIVER === "s3";

let s3: S3Client | null = null;
function clientS3() {
  if (!process.env.S3_BUCKET) throw new Error("S3_BUCKET is not set");
  s3 ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" }
      : undefined,
  });
  return s3;
}

/** File types allowed for upload: extension -> MIME. SVG is intentionally not allowed (XSS risk). */
export const ALLOWED_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
};

export function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_MIME[ext] ?? "application/octet-stream";
}

/** A valid storage key: only under media/ or recordings/, without `..`. */
export function isValidKey(key: string) {
  return /^(media|recording)\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]{2,5}$/.test(key) && !key.includes("..");
}

export async function saveFile(key: string, data: Buffer, contentType: string) {
  if (useS3()) {
    await clientS3().send(
      new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: data, ContentType: contentType }),
    );
    return;
  }
  const target = path.join(/*turbopackIgnore: true*/ ROOT, key);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, data);
}

export async function deleteFile(key: string) {
  if (!isValidKey(key)) return;
  try {
    if (useS3()) await clientS3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    else await fsp.unlink(path.join(/*turbopackIgnore: true*/ ROOT, key));
  } catch {
    /* the file no longer exists: ignore */
  }
}

/** Temporary URL (S3) for reading a file. `downloadName`, when given, makes the browser save it under that name instead of viewing it inline. */
export async function s3ReadUrl(key: string, downloadName?: string) {
  return getSignedUrl(
    clientS3(),
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ResponseContentDisposition: downloadName ? contentDisposition(downloadName) : undefined }),
    { expiresIn: 3600 },
  );
}

/** `Content-Disposition: attachment` header value for `filename`, safe against header injection and non-ASCII names. */
export function contentDisposition(filename: string) {
  const safe = filename.replace(/["\r\n]/g, "").replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const usesS3 = useS3;

/** The whole file (for embedding images in generated documents); null when it does not exist. */
export async function readFileBytes(key: string): Promise<Buffer | null> {
  if (!isValidKey(key)) return null;
  try {
    if (useS3()) {
      const r = await clientS3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
    }
    return await fsp.readFile(path.join(/*turbopackIgnore: true*/ ROOT, key));
  } catch {
    return null;
  }
}

/** Local file info & stream, with byte-range (Range) support so audio/video can be seeked. */
export async function openLocalFile(key: string, range?: { start: number; end: number }) {
  const location = path.join(/*turbopackIgnore: true*/ ROOT, key);
  const stat = await fsp.stat(location);
  const stream = fs.createReadStream(location, range ? { start: range.start, end: range.end } : undefined);
  return { size: stat.size, stream };
}

/** Total size in bytes of the files under `prefix` (e.g. "media/<teacherId>/"). */
export async function usedBytes(prefix: string): Promise<number> {
  if (useS3()) {
    let total = 0;
    let token: string | undefined;
    do {
      const r = await clientS3().send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) total += o.Size ?? 0;
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return total;
  }
  const walk = async (dir: string): Promise<number> => {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return 0; // nothing uploaded yet
    }
    let total = 0;
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) total += await walk(full);
      else if (e.isFile()) total += (await fsp.stat(full)).size;
    }
    return total;
  };
  return walk(path.join(/*turbopackIgnore: true*/ ROOT, prefix));
}

/** Delete every file under `prefix` (a deleted teacher's uploads). `prefix` must be "media/<id>/" or "recording/<id>/". */
export async function deleteFolder(prefix: string) {
  if (!/^(media|recording)\/[A-Za-z0-9_-]+\/$/.test(prefix)) return;
  if (useS3()) {
    let token: string | undefined;
    do {
      const r = await clientS3().send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: prefix, ContinuationToken: token }));
      const keys = (r.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length) await clientS3().send(new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET, Delete: { Objects: keys } }));
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return;
  }
  await fsp.rm(path.join(/*turbopackIgnore: true*/ ROOT, prefix), { recursive: true, force: true });
}
