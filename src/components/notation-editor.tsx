"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { NOTATION_EXAMPLE, NOTATION_KINDS, NOTATION_LABELS, type Notation, type NotationKind } from "@/lib/notation";
import { NotationError, notationPng, renderNotation, uploadMedia } from "@/lib/notation-render";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Live drawing of notation text (white paper, scrolls sideways on phones instead of stretching the page). */
export function NotationPreview({ notation, className }: { notation: Notation; className?: string }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const canvas = await renderNotation(notation);
        if (cancelled || !ref.current) return;
        canvas.style.width = `${canvas.width / 2}px`;
        canvas.style.maxWidth = "none";
        ref.current.replaceChildren(canvas);
        setError("");
      } catch (e) {
        if (cancelled) return;
        ref.current?.replaceChildren();
        setError(e instanceof NotationError ? t(e.message, e.arg ?? "") : t("The notation cannot be drawn. Check it in the preview."));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // t is stable enough; redrawing on it is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notation.kind, notation.text]);
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="overflow-x-auto rounded-lg border bg-white p-1 [contain:inline-size]">
        <div ref={ref} className="min-h-12" />
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

const SYNTAX_HINT: Record<NotationKind, string> = {
  staff: "Notes: C4 D#4 Bb3, then /w /h /q /8 /16 (a dot = dotted). Chord: C4+E4+G4/h. Rest: R/q. Label under a note: C4/q[A]. Dynamics: C4/q{f}, crescendo C4/q{p,<} … F4/q{f}, a symbol alone: {mf}. Bars: | and || at the end. Header: time=3/4 key=G clef=bass",
  angka: "Digits 1-7, 0 = rest, . = hold one beat. High octave 1' , low octave 5, . Raised 4# , lowered 7b . Half beat 6_ , quarter beat 6__ . Label: 1[do]. Bars: | and ||. Header: do=G time=4/4",
};

/** Write notation as text, see it drawn, and turn it into the question image (a PNG uploaded to storage). */
export function NotationEditor({ value, onChange, onImage }: { value: Notation | null; onChange: (n: Notation | null) => void; onImage: (key: string) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const notation = value ?? { kind: "staff" as NotationKind, text: "" };

  async function makeImage() {
    if (!value?.text.trim()) return;
    setBusy(true);
    try {
      const key = await uploadMedia(await notationPng(value));
      onImage(key);
      toast.success(t("The notation is now the question image."));
    } catch (e) {
      toast.error(e instanceof NotationError ? t(e.message, e.arg ?? "") : e instanceof Error ? t(e.message) : t("Upload failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex flex-wrap gap-2">
        {NOTATION_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange({ kind: k, text: notation.kind === k ? notation.text : "" })}
            aria-pressed={Boolean(value) && notation.kind === k}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", value && notation.kind === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {t(NOTATION_LABELS[k])}
          </button>
        ))}
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t("No notation")}
          </Button>
        )}
      </div>
      {value && (
        <>
          <Textarea
            rows={3}
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            className="font-mono text-sm"
            placeholder={NOTATION_EXAMPLE[value.kind]}
            aria-label={t(NOTATION_LABELS[value.kind])}
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground">{t(SYNTAX_HINT[value.kind])}</p>
          {!value.text.trim() && (
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onChange({ ...value, text: NOTATION_EXAMPLE[value.kind] })}>
              {t("Use an example")}
            </Button>
          )}
          {value.text.trim() && <NotationPreview notation={value} />}
          <Button size="sm" className="justify-self-start" disabled={busy || !value.text.trim()} onClick={makeImage}>
            {busy ? <LoaderCircle className="animate-spin" /> : <ImagePlus />} {t("Use as the question image")}
          </Button>
        </>
      )}
    </div>
  );
}
