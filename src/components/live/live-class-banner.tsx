import Link from "next/link";
import { CalendarClock, Play } from "lucide-react";
import { RefreshAt } from "@/components/live/refresh-at";
import type { LiveSchedule } from "@/lib/live-class";
import { getT } from "@/i18n/server";

/**
 * Dashboard banner: a red "in session" card with a Play button for each class running now;
 * otherwise a quiet card for the next class today. Switches by itself when a class starts or ends.
 */
export async function LiveClassBanner({ live, next }: { live: LiveSchedule[]; next: LiveSchedule | null }) {
  if (live.length === 0 && !next) return null;
  const t = await getT();
  const times = [...live.map((s) => s.jamSelesai), ...(next ? [next.jamMulai] : [])];
  return (
    <div className="mb-6 grid gap-3">
      <RefreshAt times={times} />
      {live.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger-soft/50 p-4 shadow-xs">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
              <span className="relative inline-flex size-3 rounded-full bg-danger" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-danger">{t("Class in session")}</p>
              <p className="break-words font-bold">
                {s.classroomName} · {s.mataPelajaran}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.jamMulai}–{s.jamSelesai}
              </p>
            </div>
          </div>
          <Link
            href={`/teacher/live/${s.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-danger px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-110"
          >
            <Play className="size-4 fill-current" /> {t("Start Live Class")}
          </Link>
        </div>
      ))}
      {live.length === 0 && next && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <CalendarClock className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("Next class today")}</p>
              <p className="break-words font-bold">
                {next.classroomName} · {next.mataPelajaran}
              </p>
              <p className="text-xs text-muted-foreground">{t("Starts at {0}", next.jamMulai)}</p>
            </div>
          </div>
          <Link href={`/teacher/live/${next.id}`} className="inline-flex h-11 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-semibold transition hover:bg-muted">
            <Play className="size-4" /> {t("Open Live Class")}
          </Link>
        </div>
      )}
    </div>
  );
}
