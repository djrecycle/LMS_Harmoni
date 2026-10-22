"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { OutsideTopic, TopicSuggestions } from "@/lib/form-data";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Sentinel for the "no class set" filter chip. */
const NO_KELAS = "";

/**
 * Free-text topic input with a dropdown of suggestions: the teacher's saved lessons, topics already used outside a TP, then the
 * teacher's TP from Perangkat Ajar grouped by class, semester and BAB. Each suggestion shows its class
 * and the dropdown can be filtered by class. Picking one fills the text; the teacher can still type anything else.
 */
export function TopicPicker({
  id,
  name,
  value,
  onChange,
  suggestions,
  required,
  maxLength,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: TopicSuggestions;
  required?: boolean;
  maxLength?: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  /** null = all classes; NO_KELAS = only suggestions without a class. */
  const [kelasFilter, setKelasFilter] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const q = value.trim().toLowerCase();
  const byNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  const flat = [...suggestions.materials, ...suggestions.outsideTp];
  const allKelas = [...new Set([...flat.flatMap((x) => x.kelas), ...suggestions.groups.map((g) => g.kelas).filter(Boolean)])].sort(byNum);
  const hasNoKelas = flat.some((x) => x.kelas.length === 0) || suggestions.groups.some((g) => !g.kelas);
  const kelasOk = (kelas: string[]) => kelasFilter === null || (kelasFilter === NO_KELAS ? kelas.length === 0 : kelas.includes(kelasFilter));
  const matches = (x: OutsideTopic) => (!q || x.topic.toLowerCase().includes(q)) && kelasOk(x.kelas);
  const materials = suggestions.materials.filter(matches);
  const outsideTp = suggestions.outsideTp.filter(matches);
  const groups = suggestions.groups
    .filter((g) => kelasOk(g.kelas ? [g.kelas] : []))
    .map((g) => ({ ...g, tp: g.tp.filter((x) => !q || x.toLowerCase().includes(q)) }))
    .filter((g) => g.tp.length > 0);
  const hasAny = materials.length > 0 || outsideTp.length > 0 || groups.length > 0;

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  const itemClass = "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted";
  const badgeClass = "mt-px shrink-0 whitespace-nowrap rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary";
  const chipClass = (active: boolean) =>
    cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium", active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted");
  const kelasLabel = (k: string) => `${t("Class")} ${k}`;
  const headerClass = "mt-1.5 border-t px-2 py-1 text-xs font-bold text-muted-foreground uppercase first:mt-0 first:border-t-0";

  return (
    <div className="relative" ref={boxRef}>
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        required={required}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      {open && (hasAny || kelasFilter !== null) && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-card p-1 shadow-lg">
          {allKelas.length > 0 && (
            <div className="sticky -top-1 z-10 -mx-1 -mt-1 mb-1 flex gap-1.5 overflow-x-auto border-b bg-card px-2 py-1.5" role="group" aria-label={t("Filter by class")}>
              {[null, ...allKelas, ...(hasNoKelas ? [NO_KELAS] : [])].map((k) => (
                <button key={k ?? "all"} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setKelasFilter(k)} className={chipClass(kelasFilter === k)} aria-pressed={kelasFilter === k}>
                  {k === null ? t("All") : k === NO_KELAS ? t("No class") : kelasLabel(k)}
                </button>
              ))}
            </div>
          )}
          {!hasAny && <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("No matching topics.")}</p>}
          {[
            { label: t("Saved lessons"), items: materials },
            { label: t("Outside a TP"), items: outsideTp },
          ].map(
            (sec) =>
              sec.items.length > 0 && (
                <div key={sec.label}>
                  <p className={headerClass}>{sec.label}</p>
                  {sec.items.map((x) => (
                    <button key={x.topic} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x.topic)} className={itemClass}>
                      <span className="min-w-0 flex-1 break-words">{x.topic}</span>
                      {x.kelas.map((k) => (
                        <span key={k} className={badgeClass}>
                          {kelasLabel(k)}
                        </span>
                      ))}
                    </button>
                  ))}
                </div>
              ),
          )}
          {groups.map((g, i) => (
            <div key={i}>
              <p className={headerClass}>
                {g.kelas && <span className={cn(badgeClass, "mr-1.5 normal-case")}>{kelasLabel(g.kelas)}</span>}
                {t("Semester")} {g.semester}
                {g.babNomor && ` · BAB ${g.babNomor}${g.babJudul ? ` — ${g.babJudul}` : ""}`}
              </p>
              {g.tp.map((x) => (
                <button key={x} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)} className={itemClass}>
                  <span className="min-w-0 flex-1 break-words">{x}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
