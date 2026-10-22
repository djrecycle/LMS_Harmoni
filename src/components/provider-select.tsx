"use client";

import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { Select } from "@/components/ui/input";
import { useT } from "@/i18n/client";

export type ProviderOption = { id: "claude-cli" | "anthropic" | "gemini" | "ollama"; label: string; available: boolean };
export type ProviderPick = "auto" | ProviderOption["id"];

const KEY = "harmoni.aiProvider";

/** The teacher's provider choice, remembered in this browser (a per-viewer convenience only). */
export function useProviderPick(): [ProviderPick, (v: ProviderPick) => void] {
  const [pick, setPick] = useState<ProviderPick>("auto");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "auto" || v === "claude-cli" || v === "anthropic" || v === "gemini" || v === "ollama") setPick(v);
    } catch {
      /* storage blocked: keep "auto" */
    }
  }, []);
  return [
    pick,
    (v) => {
      setPick(v);
      try {
        localStorage.setItem(KEY, v);
      } catch {
        /* ignore */
      }
    },
  ];
}

/** Can the chosen provider be used? "auto" needs at least one. */
export const providerReady = (options: ProviderOption[], pick: ProviderPick) => (pick === "auto" ? options.some((o) => o.available) : Boolean(options.find((o) => o.id === pick)?.available));

export function ProviderSelect({ options, value, onChange, disabled }: { options: ProviderOption[]; value: ProviderPick; onChange: (v: ProviderPick) => void; disabled?: boolean }) {
  const t = useT();
  return (
    // On phones the select drops under its label at full width: at a fixed w-64 next to the label it was wider than the screen.
    <label className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 text-sm font-semibold sm:inline-flex sm:w-auto">
      <Cpu className="size-4 text-muted-foreground" aria-hidden />
      <span>{t("AI provider")}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value as ProviderPick)} disabled={disabled} className="h-10 w-full min-w-0 text-sm sm:w-64" aria-label={t("AI provider")}>
        <option value="auto">{t("Automatic (Claude Code first)")}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={!o.available}>
            {o.label}
            {o.available ? "" : ` — ${t("not available")}`}
          </option>
        ))}
      </Select>
    </label>
  );
}
