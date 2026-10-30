"use client";

import { useSyncExternalStore } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Height multipliers for the piano keys in Virtual Piano (smallest to largest). */
const KEY_SCALES = [0.7, 1, 1.3, 1.6];
const STORAGE_KEY = "harmoni.keySize";
const DEFAULT = 1;

let size = DEFAULT;
try {
  const saved = typeof window !== "undefined" ? Number(window.localStorage.getItem(STORAGE_KEY)) : NaN;
  if (Number.isInteger(saved) && saved >= 0 && saved < KEY_SCALES.length) size = saved;
} catch {
  /* storage blocked: keep the default */
}
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function setSize(next: number) {
  size = Math.max(0, Math.min(KEY_SCALES.length - 1, next));
  try {
    window.localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

/** The chosen key height multiplier, shared by every Virtual Piano keyboard and kept in this browser. */
export function useKeyScale() {
  const i = useSyncExternalStore(subscribe, () => size, () => DEFAULT);
  return KEY_SCALES[i];
}

/** − / + buttons to make the piano keys smaller or larger. */
export function KeySizeControl() {
  const t = useT();
  const i = useSyncExternalStore(subscribe, () => size, () => DEFAULT);
  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border bg-card p-0.5" role="group" aria-label={t("Key size")}>
      <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("Smaller keys")} disabled={i <= 0} onClick={() => setSize(i - 1)}>
        <ZoomOut />
      </Button>
      <span className="px-1 text-sm font-semibold short:hidden">{t("Keys")}</span>
      <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("Larger keys")} disabled={i >= KEY_SCALES.length - 1} onClick={() => setSize(i + 1)}>
        <ZoomIn />
      </Button>
    </div>
  );
}
