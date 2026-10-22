"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { presenceHeartbeat } from "@/app/actions/live";

const INTERVAL_MS = 30_000;

/** Tells the server this student is online (and which page is open) while the tab is visible. Renders nothing. */
export function PresenceHeartbeat() {
  const path = usePathname();
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") presenceHeartbeat(path).catch(() => {});
    };
    beat();
    const id = setInterval(beat, INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [path]);
  return null;
}
