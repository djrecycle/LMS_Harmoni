import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Live visitor tracking for the Super Admin's Visitors page. Kept in this process's memory only
 * (nothing is written to the database), so it starts empty again after every deploy or restart.
 * Page views come from server renders: signed-in users via getRealUser(), guests via the root layout.
 */

export type VisitorRole = "teacher" | "student" | "guest" | "bot";

export type Visitor = {
  key: string;
  name: string | null;
  role: VisitorRole;
  isAdmin: boolean;
  /** IP with the last part hidden, e.g. 103.21.40.x */
  ip: string;
  device: string;
  path: string;
  firstSeen: number;
  lastSeen: number;
  /** Last request time per page; repeats within REPEAT_WINDOW (reloads, auto-refresh, several tabs) are not counted again. */
  recent: Record<string, number>;
  views: number;
};

type Hit = { t: number; path: string; key: string; role: VisitorRole };

type State = { startedAt: number; visitors: Map<string, Visitor>; hits: Hit[] };

const g = globalThis as typeof globalThis & { __harmoniTraffic?: State };
const state: State = (g.__harmoniTraffic ??= { startedAt: Date.now(), visitors: new Map(), hits: [] });

const HOUR = 60 * 60 * 1000;
const KEEP_VISITORS = 26 * HOUR;
const MAX_VISITORS = 20_000;
const MAX_HITS = 50_000;
export const ONLINE_WINDOW = 5 * 60 * 1000;
const REPEAT_WINDOW = 60 * 1000;

const BOT_RE = /bot|crawl|spider|slurp|curl|wget|python|httpclient|go-http|java\/|headless|lighthouse|monitor|uptime|preview|facebookexternalhit|whatsapp|telegram/i;

function maskIp(ip: string) {
  if (ip.includes(".")) return ip.replace(/\.\d+$/, ".x");
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + ":…";
  return ip || "?";
}

/** A short "Android phone · Chrome" style label; good enough to tell visitors apart. */
export function deviceLabel(ua: string): string {
  if (!ua) return "?";
  if (BOT_RE.test(ua)) return (/([a-z0-9_-]*(bot|crawler|spider))/i.exec(ua)?.[1] ?? ua.split(/[\s/]/)[0]).slice(0, 40);
  const os = /iPhone|iPad/.test(ua)
    ? /iPad/.test(ua) ? "iPad" : "iPhone"
    : /Android/.test(ua)
      ? /Mobile/.test(ua) ? "Android phone" : "Android tablet"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /CrOS/.test(ua)
            ? "Chromebook"
            : /Linux/.test(ua)
              ? "Linux"
              : "?";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome|CriOS/.test(ua)
            ? "Chrome"
            : /Safari/.test(ua)
              ? "Safari"
              : "";
  return browser ? `${os} · ${browser}` : os;
}

function prune(now: number) {
  const cutoff = now - HOUR;
  let drop = 0;
  while (drop < state.hits.length && state.hits[drop].t < cutoff) drop++;
  if (drop) state.hits.splice(0, drop);
  if (state.hits.length > MAX_HITS) state.hits.splice(0, state.hits.length - MAX_HITS);
  // Map keeps insertion order and visitors are re-inserted on every visit, so the oldest come first.
  for (const [k, v] of state.visitors) {
    if (v.lastSeen >= now - KEEP_VISITORS && state.visitors.size <= MAX_VISITORS) break;
    state.visitors.delete(k);
  }
}

/**
 * Count this request. `user` is the signed-in account (null for guests). Prefetches and health checks are
 * ignored; server actions and /api calls only keep the visitor "online" without counting a page view.
 */
export async function recordVisit(user: { id: string; name: string; role: "teacher" | "student"; isAdmin: boolean } | null) {
  try {
    const h = await headers();
    if (h.get("next-router-prefetch") || h.get("next-router-segment-prefetch") || h.get("purpose") === "prefetch") return;
    const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
    if (!ip || ip === "127.0.0.1" || ip === "::1") {
      // Docker's own health check (wget from inside the container) has no forwarded IP: skip it.
      if (!user) return;
    }
    const ua = h.get("user-agent") ?? "";
    const path = (h.get("x-pathname") ?? "").slice(0, 200) || "?";
    const isPage = !h.get("next-action") && !path.startsWith("/api/") && path !== "?";
    const role: VisitorRole = user ? user.role : BOT_RE.test(ua) ? "bot" : "guest";
    const key = user ? `u:${user.id}` : `g:${createHash("sha1").update(`${ip}|${ua}`).digest("base64url").slice(0, 16)}`;
    const now = Date.now();

    const prev = state.visitors.get(key);
    const recent: Record<string, number> = {};
    for (const [p, at] of Object.entries(prev?.recent ?? {})) if (now - at < REPEAT_WINDOW) recent[p] = at;
    const isPageView = isPage && !(path in recent);
    if (isPage) recent[path] = now;
    state.visitors.delete(key);
    state.visitors.set(key, {
      key,
      name: user?.name ?? null,
      role,
      isAdmin: Boolean(user?.isAdmin),
      ip: maskIp(ip),
      device: deviceLabel(ua),
      path: isPage ? path : (prev?.path ?? path),
      recent,
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
      views: (prev?.views ?? 0) + (isPageView ? 1 : 0),
    });
    if (isPageView) state.hits.push({ t: now, path, key, role });
    prune(now);
  } catch {
    // Tracking must never break a page.
  }
}

/** Long ids in paths become ":id" so /teacher/classes/abc… and /teacher/classes/def… count as one page. */
const pagePattern = (p: string) =>
  p
    .split("/")
    .map((s) => (s.length >= 12 && /\d/.test(s) ? ":id" : s))
    .join("/");

/** Start of today in WIB (UTC+7), as epoch ms. */
const startOfTodayWib = (now: number) => {
  const off = 7 * HOUR;
  return Math.floor((now + off) / (24 * HOUR)) * 24 * HOUR - off;
};

export type TrafficSummary = {
  now: number;
  startedAt: number;
  online: Visitor[];
  onlineByRole: Record<VisitorRole, number>;
  viewsLastHour: number;
  visitorsLastHour: number;
  visitorsToday: number;
  /** Page views (people, not bots) per minute for the last 60 minutes, oldest first. */
  perMinute: { t: number; views: number }[];
  topPages: { path: string; views: number }[];
};

export function trafficSummary(): TrafficSummary {
  const now = Date.now();
  prune(now);
  const online = [...state.visitors.values()].filter((v) => v.lastSeen >= now - ONLINE_WINDOW).sort((a, b) => b.lastSeen - a.lastSeen);
  const onlineByRole: Record<VisitorRole, number> = { teacher: 0, student: 0, guest: 0, bot: 0 };
  for (const v of online) onlineByRole[v.role]++;

  const people = state.hits.filter((h) => h.role !== "bot");
  const minute = 60_000;
  const lastMinute = Math.floor(now / minute);
  const perMinute = Array.from({ length: 60 }, (_, i) => ({ t: (lastMinute - 59 + i) * minute, views: 0 }));
  const pages = new Map<string, number>();
  for (const h of people) {
    const idx = Math.floor(h.t / minute) - (lastMinute - 59);
    if (idx >= 0 && idx < 60) perMinute[idx].views++;
    const p = pagePattern(h.path);
    pages.set(p, (pages.get(p) ?? 0) + 1);
  }
  const today = startOfTodayWib(now);
  let visitorsToday = 0;
  for (const v of state.visitors.values()) if (v.role !== "bot" && v.lastSeen >= today) visitorsToday++;

  return {
    now,
    startedAt: state.startedAt,
    online,
    onlineByRole,
    viewsLastHour: people.length,
    visitorsLastHour: new Set(people.map((h) => h.key)).size,
    visitorsToday,
    perMinute,
    topPages: [...pages].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, 8),
  };
}
