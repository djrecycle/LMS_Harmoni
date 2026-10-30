"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, ListMusic, Maximize2, Minimize2, Piano as PianoIcon } from "lucide-react";
import { FreeRecorder } from "@/components/free-recorder";
import { Button } from "@/components/ui/button";
import { InstrumentSelect } from "@/components/instrument-select";
import { Metronome } from "@/components/metronome";
import { Piano } from "@/components/piano";
import { SongPlayer } from "@/components/song-player";
import type { Song } from "@/lib/songs";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Virtual piano page: free play, or play a song with falling notes.
 *  The song player has its own metronome that follows the song, so the stand-alone one is shown only for free play. */
export function PianoModes({ songs }: { songs: Song[] }) {
  const t = useT();
  const [tab, setTab] = useState<"free" | "song">("song");
  // Free Play: plain piano (with the metronome panel), or the piano roll to record a song.
  const [roll, setRoll] = useState(true);
  const tabs = [
    { id: "song", label: t("Play a Song"), Icon: ListMusic },
    { id: "free", label: t("Free Play"), Icon: PianoIcon },
  ] as const;

  // Full screen: covers the whole window (and the browser's own full screen where supported).
  const rootRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const viaApi = useRef(false);
  const enterFull = () => {
    setFull(true);
    rootRef.current
      ?.requestFullscreen?.()
      .then(() => (viaApi.current = true))
      .catch(() => {}); // e.g. iPhone: the page still fills the window
  };
  const exitFull = () => {
    setFull(false);
    if (viaApi.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    viaApi.current = false;
  };
  useEffect(() => {
    if (!full) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Leaving the browser's full screen (Esc) also closes ours.
    const onFullscreenChange = () => {
      if (viaApi.current && !document.fullscreenElement) {
        viaApi.current = false;
        setFull(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setFull(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  return (
    <div ref={rootRef} className={cn(full && "fixed inset-0 z-50 overflow-y-auto bg-background p-3 sm:p-4")}>
      <div className={cn("grid gap-6", tab === "free" && !roll && "lg:grid-cols-[1fr_20rem] lg:items-start", full && "min-h-full gap-3")}>
        <div className={cn("grid gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:p-5", full && "flex flex-col p-3 sm:p-4")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" className="inline-flex w-fit rounded-xl border bg-card p-1 shadow-xs">
              {tabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn("inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors [&_svg]:size-4", tab === id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  <Icon /> {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {tab === "free" && (
                <Button type="button" variant={roll ? "secondary" : "outline"} aria-pressed={roll} onClick={() => setRoll((x) => !x)}>
                  <AudioLines /> {t("Piano roll & record")}
                </Button>
              )}
              <InstrumentSelect />
              {full ? (
                <Button type="button" onClick={exitFull}>
                  <Minimize2 /> {t("Exit full screen")}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={enterFull}>
                  <Maximize2 /> {t("Full screen")}
                </Button>
              )}
            </div>
          </div>
          {/* Only one is mounted at a time so their computer-keyboard shortcuts don't both fire. */}
          {tab === "song" ? (
            <SongPlayer songs={songs} full={full} />
          ) : roll ? (
            <FreeRecorder fill={full} />
          ) : (
            // In full screen the keys sit at the bottom of the screen.
            <Piano sizeControl className={full ? "mt-auto" : undefined} keysClassName={full ? "[--kh:16rem] sm:[--kh:20rem]" : undefined} />
          )}
        </div>
        {/* The piano roll has its own metronome (it follows the recording tempo). */}
        {tab === "free" && !roll && <Metronome />}
      </div>
    </div>
  );
}
