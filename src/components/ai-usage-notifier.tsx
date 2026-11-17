"use client";

import { useEffect, useState } from "react";
import type { RecentUsageResponse } from "@/app/api/ai-usage/recent/route";
import { allowanceText, formatUsd, providerName, tokenLine } from "@/lib/ai-usage-format";
import { useLocale, useT } from "@/i18n/client";

const PREF_KEY = "harmoni.aiUsageNotice";
const PREF_EVENT = "harmoni:ai-usage-pref";
/** Ask often for a while after the teacher did something (an AI action may be running), rarely otherwise. */
const FAST_MS = 4000;
const SLOW_MS = 60_000;
const ACTIVE_WINDOW_MS = 5 * 60_000;
/** How long the footer line stays before it fades out. */
const SHOW_MS = 20_000;

/** Whether the notice after each AI use is on in this browser (a per-viewer preference). */
export function readUsageNoticePref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeUsageNoticePref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* storage blocked: the setting lasts for this page only */
  }
  window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: on }));
}

/**
 * After every AI request (also background jobs such as an exam or a Modul Ajar) shows what it used: provider, model,
 * tokens and, where known, what is left of the free allowance. Mounted once in the teacher layout.
 * It is a faint line at the bottom of the screen (above the phone menu), not a pop-up, so it never covers the page;
 * it fades out after a while. The notes behind the allowance are on the AI Settings card.
 */
export function AiUsageNotifier() {
  const t = useT();
  const locale = useLocale();
  const [line, setLine] = useState<{ text: string; key: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!line) return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), SHOW_MS);
    return () => clearTimeout(hide);
  }, [line]);

  useEffect(() => {
    let on = readUsageNoticePref();
    let cursor: string | null = null;
    let lastActivity = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inFlight = false;

    const show = (groups: RecentUsageResponse["groups"]) => {
      const parts = groups.map((g) =>
        [
          providerName(g.provider, g.host),
          g.model,
          g.requests > 1 ? t("{0} requests", g.requests) : "",
          g.kind === "image" ? t("{0} picture(s)", g.requests) : tokenLine(t, locale, g.inputTokens, g.outputTokens),
          g.costUsd != null ? `≈ ${formatUsd(g.costUsd, locale)}` : "",
          g.allowance ? allowanceText(g.allowance, t, locale) : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      setLine({ text: `${t("AI")}: ${parts.join("  |  ")}`, key: Date.now() });
    };

    const tick = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      if (on && document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/ai-usage/recent${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as RecentUsageResponse;
            if (cursor && data.groups.length) show(data.groups);
            cursor = data.cursor;
          }
        } catch {
          /* offline for a moment: try again next time */
        }
      }
      inFlight = false;
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, Date.now() - lastActivity < ACTIVE_WINDOW_MS ? FAST_MS : SLOW_MS);
    };

    const active = () => {
      const wasIdle = Date.now() - lastActivity >= ACTIVE_WINDOW_MS;
      lastActivity = Date.now();
      // Coming back from idle: switch to the quick pace now instead of after the slow wait.
      // (While a check is running, it picks the quick pace itself when it finishes.)
      if (wasIdle && on && !inFlight) {
        clearTimeout(timer);
        timer = setTimeout(tick, FAST_MS);
      }
    };
    const onPref = (e: Event) => {
      on = (e as CustomEvent<boolean>).detail;
      if (!on) cursor = null; // when turned back on, start from "now" instead of replaying what happened meanwhile
    };

    void tick();
    window.addEventListener("pointerdown", active);
    window.addEventListener("keydown", active);
    window.addEventListener(PREF_EVENT, onPref);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
      window.removeEventListener(PREF_EVENT, onPref);
    };
  }, [t, locale]);

  if (!line) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`no-print pointer-events-none fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-40 px-3 transition-opacity duration-700 lg:bottom-0 lg:left-[16.5rem] ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <p className="mx-auto w-fit max-w-full rounded-t-md bg-background/50 px-2.5 py-1 text-center text-[11px] leading-snug text-muted-foreground/90 backdrop-blur-sm">{line.text}</p>
    </div>
  );
}

/** The on/off switch for the notice, shown in the "Usage today" card. */
export function UsageNoticeToggle() {
  const t = useT();
  const [on, setOn] = useState(true);
  useEffect(() => setOn(readUsageNoticePref()), []);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          writeUsageNoticePref(e.target.checked);
        }}
      />
      {t("Show a usage summary after each AI use (this browser)")}
    </label>
  );
}
