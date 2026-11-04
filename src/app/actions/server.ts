"use server";

import fsp from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { succeed, type ActionResult } from "@/lib/action-result";
import { folderBytes, nextCacheDir } from "@/lib/server-stats";
import { formatBytes } from "@/lib/utils";
import { requireAdmin } from "@/lib/session";
import { getT } from "@/i18n/server";

/**
 * Super Admin: drop the app's caches. Every page is rebuilt on its next visit and Next.js's
 * on-disk cache folder is emptied (it refills by itself). No data is lost.
 */
export async function clearAppCache(): Promise<ActionResult> {
  const t = await getT();
  await requireAdmin();
  const dir = nextCacheDir();
  // Skip in development: `next dev` keeps its compiler cache there, and deleting it only slows the next start.
  const freed = process.env.NODE_ENV === "production" ? await folderBytes(dir) : 0;
  if (freed > 0) {
    const entries = await fsp.readdir(dir).catch(() => []);
    await Promise.all(entries.map((name) => fsp.rm(`${dir}/${name}`, { recursive: true, force: true }).catch(() => {})));
  }
  revalidatePath("/", "layout");
  return succeed(freed > 0 ? t("App cache cleared ({0} freed).", formatBytes(freed)) : t("App cache cleared."));
}
