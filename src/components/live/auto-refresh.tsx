"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useT } from "@/i18n/client";

/** Re-fetches the server-rendered page every few seconds while the tab is visible. */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const t = useT();
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date());
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" });
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" suppressHydrationWarning>
      <RefreshCw className="size-3.5 animate-spin [animation-duration:3s]" />
      {t("Auto-updates · {0}", time)}
    </span>
  );
}
