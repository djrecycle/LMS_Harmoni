/**
 * Simple in-memory rate limiter (per process). Enough to slow password guessing
 *  on a single instance; for many serverless instances use shared storage (Redis/DB).
 */
const store = new Map<string, { n: number; reset: number }>();

export function rateLimit(answerKey: string, max: number, windowMs: number): { boleh: boolean; secondsWait: number } {
  const now = Date.now();
  const e = store.get(answerKey);
  if (!e || e.reset < now) {
    store.set(answerKey, { n: 1, reset: now + windowMs });
    if (store.size > 5000) for (const [k, v] of store) if (v.reset < now) store.delete(k);
    return { boleh: true, secondsWait: 0 };
  }
  e.n += 1;
  return { boleh: e.n <= max, secondsWait: Math.ceil((e.reset - now) / 1000) };
}
