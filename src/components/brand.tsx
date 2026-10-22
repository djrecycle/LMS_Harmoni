import Link from "next/link";
import { Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function Brand({ href = "/", className, kecil }: { href?: string; className?: string; kecil?: boolean }) {
  const t = await getT();
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5 font-extrabold tracking-tight", className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-sm transition-transform group-hover:rotate-6">
        <Music2 className="size-5" />
      </span>
      {!kecil && (
        <span className="leading-tight">
          Harmoni
          <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("Music Class")}</span>
        </span>
      )}
    </Link>
  );
}
