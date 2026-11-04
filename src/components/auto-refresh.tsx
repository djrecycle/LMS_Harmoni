"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Re-renders the current server page every `seconds` (paused while the tab is hidden), with pause and refresh-now buttons. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const t = useT();
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") start(() => router.refresh());
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [on, seconds, router]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOn((v) => !v)} aria-pressed={on}>
        {on ? <Pause /> : <Play />} {on ? t("Auto-update every {0} s", seconds) : t("Auto-update paused")}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => start(() => router.refresh())} disabled={busy}>
        <RefreshCw className={busy ? "animate-spin" : undefined} /> {t("Refresh")}
      </Button>
    </>
  );
}
