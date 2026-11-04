import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { usesS3 } from "@/lib/storage";

/**
 * Live numbers about the machine the app runs on (Super Admin only).
 * Inside Docker, /proc and os.* show the whole VPS (not just the container), so these are host figures,
 * except `app`, which is this Node process.
 */
export type ServerStats = {
  takenAt: string;
  cpu: { model: string; cores: number; usagePct: number; load: [number, number, number] };
  memory: { total: number; available: number; cached: number; swapTotal: number; swapFree: number };
  disk: { total: number; free: number } | null;
  uptimeSec: number;
  kernel: string;
  app: { rss: number; heapUsed: number; uptimeSec: number; node: string };
  database: { bytes: number } | null;
};

/** CPU busy share over a short window, from two snapshots of the per-core time counters. */
async function cpuUsage(windowMs = 400): Promise<number> {
  const snap = () =>
    os.cpus().reduce(
      (acc, c) => {
        const t = c.times;
        acc.idle += t.idle;
        acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
        return acc;
      },
      { idle: 0, total: 0 },
    );
  const a = snap();
  await new Promise((r) => setTimeout(r, windowMs));
  const b = snap();
  const total = b.total - a.total;
  return total > 0 ? Math.max(0, Math.min(100, (1 - (b.idle - a.idle) / total) * 100)) : 0;
}

/** MemAvailable (what can really be used, incl. reclaimable cache) and swap from /proc/meminfo; os.* as fallback. */
async function memory(): Promise<ServerStats["memory"]> {
  try {
    const text = await fsp.readFile("/proc/meminfo", "utf8");
    const kb = (name: string) => Number(new RegExp(`^${name}:\\s+(\\d+)`, "m").exec(text)?.[1] ?? NaN) * 1024;
    const total = kb("MemTotal");
    const available = kb("MemAvailable");
    if (Number.isFinite(total) && Number.isFinite(available)) {
      const cached = (kb("Buffers") || 0) + (kb("Cached") || 0) + (kb("SReclaimable") || 0);
      return { total, available, cached, swapTotal: kb("SwapTotal") || 0, swapFree: kb("SwapFree") || 0 };
    }
  } catch {}
  return { total: os.totalmem(), available: os.freemem(), cached: 0, swapTotal: 0, swapFree: 0 };
}

async function disk(): Promise<ServerStats["disk"]> {
  try {
    // The upload volume sits on the VPS's main disk; with S3 storage the app's own folder is used instead.
    const dir = usesS3() ? process.cwd() : (process.env.UPLOAD_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads"));
    const s = await fsp.statfs(dir);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

async function databaseSize(): Promise<ServerStats["database"]> {
  try {
    const r = (await db.execute(sql`select pg_database_size(current_database())::bigint as bytes`)) as unknown as { rows: { bytes: string | number }[] };
    const bytes = Number(r.rows?.[0]?.bytes);
    return Number.isFinite(bytes) ? { bytes } : null;
  } catch {
    return null;
  }
}

export async function serverStats(): Promise<ServerStats> {
  const [usagePct, mem, dsk, database] = await Promise.all([cpuUsage(), memory(), disk(), databaseSize()]);
  const cpus = os.cpus();
  const pm = process.memoryUsage();
  const [l1, l5, l15] = os.loadavg();
  return {
    takenAt: new Date().toISOString(),
    cpu: { model: cpus[0]?.model?.trim() || "CPU", cores: cpus.length || os.availableParallelism(), usagePct, load: [l1, l5, l15] },
    memory: mem,
    disk: dsk,
    uptimeSec: os.uptime(),
    kernel: `${os.type()} ${os.release()}`,
    app: { rss: pm.rss, heapUsed: pm.heapUsed, uptimeSec: process.uptime(), node: process.version },
    database,
  };
}

/** Next.js's own on-disk cache (fetch results, optimized images). Safe to delete: it is rebuilt when needed. */
export const nextCacheDir = () => path.join(/*turbopackIgnore: true*/ process.cwd(), ".next", "cache");

export async function folderBytes(dir: string): Promise<number> {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await folderBytes(p);
    else if (e.isFile()) total += (await fsp.stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}
