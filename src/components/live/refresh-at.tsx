"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the page once a WIB "HH:mm" time is reached today (e.g. when the next class starts or the current one ends). */
export function RefreshAt({ times }: { times: string[] }) {
  const router = useRouter();
  useEffect(() => {
    const now = new Date();
    // WIB is UTC+7 with no DST: build today's WIB timestamps directly.
    const wibDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(now);
    const waits = times.map((t) => new Date(`${wibDate}T${t}:00+07:00`).getTime() - now.getTime()).filter((ms) => ms > 0);
    if (!waits.length) return;
    const id = setTimeout(() => router.refresh(), Math.min(...waits) + 1500);
    return () => clearTimeout(id);
  }, [router, times]);
  return null;
}
