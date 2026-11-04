import type { Metadata } from "next";
import { Bot, Eye, GraduationCap, Radio, UserRound, Users } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/session";
import { trafficSummary, type VisitorRole } from "@/lib/traffic";
import { getT } from "@/i18n/server";
import type { Translate } from "@/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Visitors") };
}

const ROLE_TONE = { teacher: "primary", student: "success", guest: "neutral", bot: "warning" } as const;
const ROLE_LABEL: Record<VisitorRole, string> = { teacher: "Teacher", student: "Student", guest: "Guest", bot: "Bot" };

const clock = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });

function ago(t: Translate, sec: number) {
  if (sec < 60) return t("just now");
  return t("{0} min ago", Math.floor(sec / 60));
}

/** Page views per minute, last 60 minutes: one series in the brand color, hover a bar for its value. */
function MinuteBars({ t, data }: { t: Translate; data: { t: number; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  const peak = data.reduce((a, b) => (b.views > a.views ? b : a), data[0]);
  return (
    <figure className="grid gap-2">
      <div className="flex h-36 items-end gap-[2px]" role="img" aria-label={t("Page views per minute, last 60 minutes. Highest: {0} at {1}.", peak.views, clock(peak.t))}>
        {data.map((d) => (
          <div key={d.t} className="group relative flex h-full flex-1 items-end" title={`${clock(d.t)} · ${t("{0} page views", d.views)}`}>
            <div
              className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
              style={{ height: d.views ? `${Math.max(3, (d.views / max) * 100)}%` : "0%" }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs shadow-sm group-hover:block">
              <span className="font-semibold">{d.views}</span> · {clock(d.t)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t pt-1 text-xs text-muted-foreground">
        <span>{clock(data[0].t)}</span>
        <span>{t("max {0} / min", max)}</span>
        <span>{clock(data[data.length - 1].t)}</span>
      </div>
    </figure>
  );
}

/** Super Admin: who is on the site right now and how busy it has been in the last hour. */
export default async function VisitorsPage() {
  const t = await getT();
  await requireAdmin();
  const s = trafficSummary();
  const people = s.online.length - s.onlineByRole.bot;

  return (
    <>
      <PageHeader
        title={t("Visitors")}
        description={t("Who is using the site right now. Only you (Super Admin) can see this page.")}
        action={<AutoRefresh seconds={10} />}
      />
      <p className="-mt-3 mb-4 text-xs text-muted-foreground">
        {t("Counted since {0} WIB (the count starts again after every deploy or restart). Online = active in the last 5 minutes.", clock(s.startedAt))}
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("Online now")}
          value={people}
          icon={<Radio />}
          keterangan={t("{0} teachers · {1} students · {2} guests", s.onlineByRole.teacher, s.onlineByRole.student, s.onlineByRole.guest)}
        />
        <StatCard label={t("Page views (last hour)")} value={s.viewsLastHour} icon={<Eye />} keterangan={t("{0} different visitors", s.visitorsLastHour)} />
        <StatCard label={t("Visitors today")} value={s.visitorsToday} icon={<Users />} />
        <StatCard label={t("Bots online")} value={s.onlineByRole.bot} icon={<Bot />} keterangan={t("Search engines & link previews")} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5 lg:col-span-2">
          <h2 className="font-bold">{t("Page views per minute (last 60 minutes)")}</h2>
          <MinuteBars t={t} data={s.perMinute} />
        </section>
        <section className="grid content-start gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
          <h2 className="font-bold">{t("Most opened pages (last hour)")}</h2>
          {s.topPages.length ? (
            <ol className="grid gap-1.5 text-sm">
              {s.topPages.map((p) => (
                <li key={p.path} className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-all font-mono text-xs">{p.path}</span>
                  <span className="shrink-0 font-semibold">{p.views}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{t("No page views yet.")}</p>
          )}
        </section>
      </div>

      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <h2 className="font-bold">{t("Online now ({0})", s.online.length)}</h2>
        {s.online.length ? (
          <ul className="grid divide-y">
            {s.online.map((v) => (
              <li key={v.key} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="flex min-w-0 flex-1 basis-56 items-start gap-2">
                  {v.role === "teacher" ? (
                    <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  ) : v.role === "student" ? (
                    <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  ) : v.role === "bot" ? (
                    <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {v.name ?? v.device} <Badge tone={ROLE_TONE[v.role]}>{v.isAdmin ? t("Super Admin") : t(ROLE_LABEL[v.role])}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.name ? `${v.device} · ${v.ip}` : v.ip}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="break-all font-mono text-xs">{v.path}</p>
                  <p className="text-xs text-muted-foreground">{t("{0} pages opened", v.views)}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{ago(t, Math.round((s.now - v.lastSeen) / 1000))}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("Nobody online right now")} />
        )}
      </section>
    </>
  );
}
