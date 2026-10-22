"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { FlatEvent } from "@/lib/calendar-data";

const KIND_DOT: Record<string, string> = {
  libur: "bg-danger",
  nasional: "bg-danger",
  ujian: "bg-warning",
  pts: "bg-accent",
  pas: "bg-accent",
  efektif: "bg-success",
  lainnya: "bg-primary",
};

const KIND_LABEL: Record<string, string> = { libur: "Libur", nasional: "Libur nasional", ujian: "Ujian", pts: "PTS", pas: "PAS", efektif: "Efektif", lainnya: "Lainnya" };

const WEEKDAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * One month's grid (Sunday-first), with a coloured dot per day that has an event. Hovering a day shows a
 * quick native tooltip; clicking it opens the full list of events for that day below the grid.
 */
export function CalendarMonth({ year, month, events }: { year: number; month: number; events: FlatEvent[] }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const first = new Date(Date.UTC(year, month, 1));
  const startWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const iso = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const eventsOn = (day: string) => events.filter((e) => e.start <= day && day <= e.end);

  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const selectedEvents = selected ? eventsOn(selected) : [];

  return (
    <div className="rounded-xl border bg-card p-3 shadow-xs">
      <p className="mb-2 text-center text-sm font-bold capitalize">{monthName}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold text-muted-foreground">
        {WEEKDAY.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const day = d ? iso(d) : null;
          const dayEvents = day ? eventsOn(day) : [];
          return (
            <button
              key={i}
              type="button"
              disabled={!d || dayEvents.length === 0}
              onClick={() => day && setSelected((cur) => (cur === day ? null : day))}
              aria-pressed={Boolean(day) && selected === day}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-md text-xs",
                !d && "invisible",
                dayEvents.length > 0 ? "cursor-pointer bg-muted font-semibold hover:brightness-95" : "text-muted-foreground",
                day && selected === day && "ring-2 ring-primary",
              )}
              title={dayEvents.map((e) => e.label).join("; ")}
            >
              {d}
              {dayEvents.length > 0 && (
                <span className="mt-0.5 flex gap-0.5">
                  {[...new Set(dayEvents.map((e) => e.kind))].slice(0, 3).map((k) => (
                    <span key={k} className={cn("size-1.5 rounded-full", KIND_DOT[k] ?? "bg-muted-foreground")} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && selectedEvents.length > 0 && (
        <div className="mt-3 rounded-lg border bg-muted/50 p-2.5 text-sm">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="font-semibold">{formatDate(selected)}</p>
            <button type="button" onClick={() => setSelected(null)} aria-label={t("Close")} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <ul className="grid gap-1">
            {selectedEvents.map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", KIND_DOT[e.kind] ?? "bg-muted-foreground")} />
                <span>
                  <span className="font-medium">{t(KIND_LABEL[e.kind] ?? e.kind)}</span>
                  {" — "}
                  {e.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export { KIND_DOT, KIND_LABEL };
