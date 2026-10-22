/**
 * Small accessors for JSON produced by the AI. Model output is untrusted and can miss keys or use the wrong
 * type, so every reader goes through these (the original app used `dict.get(...) or []` for the same reason).
 */
export type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Object or empty object. */
export const obj = (v: unknown): Obj => (isObj(v) ? v : {});

/** Array or empty array. */
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Trimmed string; numbers are converted, everything else becomes "". */
export const str = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
};

/** Array of non-empty strings. */
export const strs = (v: unknown): string[] => arr(v).map(str).filter(Boolean);

/** Array of objects. */
export const objs = (v: unknown): Obj[] => arr(v).filter(isObj);
