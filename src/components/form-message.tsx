import { Alert } from "@/components/ui/misc";
import type { ActionResult } from "@/lib/action-result";

/** Shows a general error / success message from a server action result. */
export function FormMessage({ state }: { state: ActionResult<unknown> }) {
  if (state.error && !state.ok) return <Alert kind="error">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert kind="success">{state.message}</Alert>;
  return null;
}
