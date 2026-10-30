/** Screen orientation control (lock/unlock exist on Android browsers in full screen, not on iPhone). */
const orientation = () =>
  (typeof screen !== "undefined" ? screen.orientation : undefined) as (ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void }) | undefined;

/** Phones and tablets turn to landscape (call right after entering the browser's full screen). */
export function lockLandscape() {
  if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) void orientation()?.lock?.("landscape").catch(() => {});
}

/** Lets the screen follow the device again (call when leaving full screen). */
export function unlockOrientation() {
  try {
    orientation()?.unlock?.();
  } catch {
    /* not supported */
  }
}
