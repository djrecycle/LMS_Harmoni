import type { ZodError } from "zod";
import { getT } from "@/i18n/server";
import { formValues, type ActionResult } from "./action-result";

/** Turn a Zod error into an action result, translating the validation messages to the current language. */
export async function zodError(err: ZodError, fd?: FormData): Promise<ActionResult<never>> {
  const t = await getT();
  const fieldErrors: Record<string, string> = {};
  for (const isu of err.issues) {
    const k = isu.path.join(".") || "_";
    fieldErrors[k] ??= t(isu.message);
  }
  const pertama = t(err.issues[0]?.message ?? "Invalid data");
  return { ok: false, error: pertama, fieldErrors, values: formValues(fd) };
}
