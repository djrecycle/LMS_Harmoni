"use client";

import { useState } from "react";
import { ListMusic, Piano as PianoIcon } from "lucide-react";
import { Piano } from "@/components/piano";
import { SongPlayer } from "@/components/song-player";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Virtual piano page: free play, or play a song with falling notes. */
export function PianoModes() {
  const t = useT();
  const [tab, setTab] = useState<"free" | "song">("song");
  const tabs = [
    { id: "song", label: t("Play a Song"), Icon: ListMusic },
    { id: "free", label: t("Free Play"), Icon: PianoIcon },
  ] as const;
  return (
    <div className="grid gap-4">
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
      {/* Only one is mounted at a time so their computer-keyboard shortcuts don't both fire. */}
      {tab === "song" ? <SongPlayer /> : <Piano />}
    </div>
  );
}
