"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Small uppercase label used above a section's title in interactive lessons. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold tracking-wider text-primary uppercase">{children}</p>;
}

/** Toggle button that reveals an explanation once the student has attempted the question themselves. */
export function Reveal({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        {open ? "Sembunyikan pembahasan" : title}
      </Button>
      {open && <div className="mt-2 rounded-xl bg-primary-soft/40 p-4 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export type MCQ = { q: string; options: string[]; correct: number; explain: string };

export function QuizItem({ index, item }: { index: number; item: MCQ }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  return (
    <div className="rounded-xl bg-muted p-4">
      <p className="mb-3 font-semibold">
        <span className="text-primary">{index + 1}.</span> {item.q}
      </p>
      <div className="grid gap-2">
        {item.options.map((opt, i) => {
          const isCorrect = checked && i === item.correct;
          const isWrong = checked && choice === i && i !== item.correct;
          return (
            <label
              key={i}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border bg-card p-3 text-sm ${isCorrect ? "border-success bg-success-soft" : ""} ${isWrong ? "border-danger bg-danger-soft" : ""}`}
            >
              <input type="radio" name={`kuis-${index}`} className="mt-0.5 accent-[var(--primary)]" checked={choice === i} disabled={checked} onChange={() => setChoice(i)} />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={() => setChecked(true)} disabled={choice === null || checked}>
          Periksa jawaban
        </Button>
        {checked && <Badge tone={choice === item.correct ? "success" : "danger"}>{choice === item.correct ? "Tepat!" : "Belum tepat"}</Badge>}
      </div>
      {checked && <p className="mt-2 text-sm text-muted-foreground">{item.explain}</p>}
    </div>
  );
}

/**
 * Numbered part tabs of an interactive lesson. On phones they sit in one row that scrolls sideways (a long lesson
 * would otherwise stack 4–5 rows of tabs above every part), keeping the active tab centred and fading the right
 * edge while more tabs are hidden there; from `sm` up they wrap onto several rows as before.
 */
export function LessonTabs({ labels, active, onSelect, label }: { labels: string[]; active: number; onSelect: (i: number) => void; label: string }) {
  const navRef = useRef<HTMLElement>(null);
  const [moreRight, setMoreRight] = useState(false);

  const updateFade = () => {
    const nav = navRef.current;
    if (nav) setMoreRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
  };

  useEffect(() => {
    const nav = navRef.current;
    const button = nav?.children[active] as HTMLElement | undefined;
    // Scroll only the tab row (scrollIntoView would also scroll the page up to it).
    if (nav && button && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: button.offsetLeft - (nav.clientWidth - button.offsetWidth) / 2, behavior: "smooth" });
    }
    updateFade();
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label={label}
      onScroll={updateFade}
      className={cn(
        "relative flex gap-1.5 overflow-x-auto [contain:inline-size] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:[contain:none] [&::-webkit-scrollbar]:hidden",
        moreRight && "[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] sm:[mask-image:none]",
      )}
    >
      {labels.map((text, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          aria-current={active === i ? "step" : undefined}
          className={cn(
            "max-w-56 shrink-0 truncate rounded-full border px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors sm:max-w-full",
            active === i ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {String(i + 1).padStart(2, "0")} · {text}
        </button>
      ))}
    </nav>
  );
}
