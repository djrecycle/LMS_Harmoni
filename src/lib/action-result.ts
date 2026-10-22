/** Standard result shape for server actions used through useActionState. */
export type ActionResult<T = undefined> = {
  ok: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted field values sent back to the form so they are not lost on an error (without passwords). */
  values?: Record<string, string>;
  data?: T;
};

export const initialState: ActionResult = { ok: false };

const SECRET_FIELDS = /(password|password|confirmText|current|fresh|token)/i;

export function formValues(fd?: FormData): Record<string, string> | undefined {
  if (!fd) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !SECRET_FIELDS.test(k) && !k.startsWith("$")) out[k] = v;
  return out;
}

export const fail = (error: string, fd?: FormData): ActionResult<never> => ({ ok: false, error, values: formValues(fd) });
export const succeed = <T = undefined>(message?: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
