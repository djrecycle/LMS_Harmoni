import type { Metadata } from "next";
import { Clock, Cpu, Database, HardDrive, MemoryStick, Server } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ClearCacheButton } from "@/components/clear-cache-button";
import { PageHeader, Progress } from "@/components/ui/misc";
import { serverStats } from "@/lib/server-stats";
import { formatBytes } from "@/lib/utils";
import { requireAdmin } from "@/lib/session";
import { getT } from "@/i18n/server";
import type { Translate } from "@/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Server Status") };
}

const pct = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);

function duration(t: Translate, sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return t("{0} d {1} h", d, h);
  if (h) return t("{0} h {1} min", h, m);
  return t("{0} min", m);
}

/** Green below 70 %, amber up to 90 %, red above: a quick "is the VPS OK?" signal. */
function level(t: Translate, p: number) {
  if (p >= 90) return { text: t("Very busy"), cls: "bg-danger-soft text-danger" };
  if (p >= 70) return { text: t("Busy"), cls: "bg-warning-soft text-accent-foreground dark:text-accent" };
  return { text: t("Normal"), cls: "bg-success-soft text-success" };
}

function Meter({ t, label, icon, p, main, detail }: { t: Translate; label: string; icon: React.ReactNode; p: number; main: string; detail?: string }) {
  const lv = level(t, p);
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary [&_svg]:size-5">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <p className="text-2xl font-extrabold leading-tight">{Math.round(p)}%</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${lv.cls}`}>{lv.text}</span>
      </div>
      <Progress value={p} label={label} />
      <div className="text-sm">
        <p>{main}</p>
        {detail && <p className="text-muted-foreground">{detail}</p>}
      </div>
    </section>
  );
}

function Info({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary [&_svg]:size-5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
        {detail && <p className="break-words text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

/** Super Admin: live CPU, memory and disk of the VPS, plus database and app size. */
export default async function ServerStatusPage() {
  const t = await getT();
  await requireAdmin();
  const s = await serverStats();
  const memUsed = s.memory.total - s.memory.available;
  const swapUsed = s.memory.swapTotal - s.memory.swapFree;
  const fmtLoad = (n: number) => n.toFixed(2);
  const time = new Date(s.takenAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });

  return (
    <>
      <PageHeader
        title={t("Server Status")}
        description={t("How hard the VPS is working right now. Only you (Super Admin) can see this page.")}
        action={
          <>
            <AutoRefresh seconds={10} />
            <ClearCacheButton />
          </>
        }
      />
      <p className="-mt-3 mb-4 text-xs text-muted-foreground">{t("Measured at {0} WIB", time)}</p>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Meter
          t={t}
          label={t("CPU")}
          icon={<Cpu />}
          p={s.cpu.usagePct}
          main={t("{0} cores", s.cpu.cores)}
          detail={t("Load (1 / 5 / 15 min): {0}", s.cpu.load.map(fmtLoad).join(" / "))}
        />
        <Meter
          t={t}
          label={t("Memory (RAM)")}
          icon={<MemoryStick />}
          p={pct(memUsed, s.memory.total)}
          main={t("{0} used of {1}", formatBytes(memUsed), formatBytes(s.memory.total))}
          detail={[
            s.memory.cached > 0 ? t("Linux cache: {0} (not counted, freed automatically when needed)", formatBytes(s.memory.cached)) : "",
            s.memory.swapTotal > 0 ? t("Swap: {0} used of {1}", formatBytes(swapUsed), formatBytes(s.memory.swapTotal)) : t("No swap"),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        {s.disk ? (
          <Meter
            t={t}
            label={t("Disk")}
            icon={<HardDrive />}
            p={pct(s.disk.total - s.disk.free, s.disk.total)}
            main={t("{0} used of {1}", formatBytes(s.disk.total - s.disk.free), formatBytes(s.disk.total))}
            detail={t("{0} free", formatBytes(s.disk.free))}
          />
        ) : (
          <Info icon={<HardDrive />} label={t("Disk")} value={t("Not available")} />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info icon={<Clock />} label={t("Server running for")} value={duration(t, s.uptimeSec)} detail={t("App running for {0}", duration(t, s.app.uptimeSec))} />
        <Info
          icon={<Server />}
          label={t("App memory")}
          value={formatBytes(s.app.rss)}
          detail={`Node ${s.app.node}`}
        />
        <Info icon={<Database />} label={t("Database size")} value={s.database ? formatBytes(s.database.bytes) : t("Not available")} />
        <Info icon={<Cpu />} label={t("Processor")} value={s.cpu.model} detail={s.kernel} />
      </div>
    </>
  );
}
