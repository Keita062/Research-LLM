import "server-only";

export type RateLimitReason =
  | "GLOBAL_RPM_TPM"
  | "GLOBAL_RPD"
  | "USER_DAILY_REQ"
  | "USER_DAILY_TOKEN";

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: RateLimitReason };

/**
 * Atomically checks + consumes both the global (RPM/TPM/RPD) and per-user daily
 * limits for one chat request, using `estimatedTokens` as a pre-flight estimate.
 * Must be race-safe under concurrent requests (Postgres row locks / SERIALIZABLE
 * transaction, NOT in-memory counters — Next.js may run multiple processes).
 * STUB: implemented by Agent-RateLimit. Do not change this function's signature —
 * Agent-Chat depends on it.
 */
export async function checkAndConsumeLimits(
  userId: string,
  estimatedTokens: number
): Promise<RateLimitResult> {
  void userId;
  void estimatedTokens;
  throw new Error("rateLimit.checkAndConsumeLimits: not implemented yet");
}

/**
 * Called after Gemini returns real usageMetadata, to correct the counters that
 * were bumped with `estimatedTokens` in checkAndConsumeLimits so aggregate
 * numbers (used by both enforcement and the admin dashboard) stay accurate.
 * STUB: implemented by Agent-RateLimit. Do not change this function's signature —
 * Agent-Chat depends on it.
 */
export async function reconcileUsage(params: {
  userId: string;
  estimatedTokens: number;
  actualTokens: number;
}): Promise<void> {
  void params;
  throw new Error("rateLimit.reconcileUsage: not implemented yet");
}
