/** An AI error whose message is safe to show to users. */
export class AiError extends Error {}

/** The service has no quota left (or this key may not use it): another service can still do the job. */
export class AiQuotaError extends AiError {}
