"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/i18n/actions";
import { useLocale } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n";
import { cn } from "@/lib/utils";

/** Small EN | ID toggle. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const current = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  const choose = (l: Locale) =>
    start(async () => {
      await setLocale(l);
      router.refresh();
    });

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg border bg-card p-0.5 text-xs font-bold", pending && "opacity-60", className)} role="group" aria-label="Language">
      <Languages className="mx-1 hidden size-3.5 text-muted-foreground sm:block" aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          disabled={pending}
          aria-pressed={current === l}
          lang={l}
          className={cn("rounded-md px-2 py-1 uppercase transition-colors", current === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
