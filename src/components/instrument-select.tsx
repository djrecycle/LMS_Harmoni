"use client";

import { useSyncExternalStore } from "react";
import { Music2 } from "lucide-react";
import { Select } from "@/components/ui/input";
import { getInstrument, getInstrumentStatus, INSTRUMENTS, playChord, setInstrument, subscribeInstrument, type InstrumentId } from "@/lib/audio";
import { useT } from "@/i18n/client";

/** Picks the sound of the piano keys. The choice is kept in this browser and applies to every piano in the app. */
export function InstrumentSelect({ className }: { className?: string }) {
  const t = useT();
  const value = useSyncExternalStore(subscribeInstrument, getInstrument, () => "grand" as InstrumentId);
  const status = useSyncExternalStore(subscribeInstrument, getInstrumentStatus, () => "idle" as const);
  return (
    <label className={className ?? "inline-flex items-center gap-2 text-sm font-semibold"}>
      <Music2 className="size-4 text-muted-foreground short:hidden" aria-hidden />
      <span className="sr-only">{t("Sound")}</span>
      <Select
        aria-label={t("Sound")}
        className="h-10 w-auto short:h-8"
        value={value}
        onChange={(e) => {
          setInstrument(e.target.value as InstrumentId);
          // A short C major chord so the new sound is heard right away.
          playChord([60, 64, 67], 0.6, 0.6);
        }}
      >
        {INSTRUMENTS.map((x) => (
          <option key={x.id} value={x.id}>
            {t(x.label)}
          </option>
        ))}
      </Select>
      {value === "grand" && status === "loading" && <span className="text-xs font-normal text-muted-foreground">{t("Loading sound…")}</span>}
      {value === "grand" && status === "error" && <span className="text-xs font-normal text-danger">{t("The recorded sound could not be loaded")}</span>}
    </label>
  );
}
