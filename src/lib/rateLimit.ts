import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type RateLimitReason =
  | "GLOBAL_RPM_TPM"
  | "GLOBAL_RPD"
  | "USER_DAILY_REQ"
  | "USER_DAILY_TOKEN";

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: RateLimitReason };

type RateLimitConfigRow = {
  globalRpmLimit: number;
  globalTpmLimit: number;
  globalRpdLimit: number;
  userDailyReqLimit: number;
  userDailyTokenLimit: number;
};

// Module-level cache for RateLimitConfig (id=1). Short TTL is acceptable here
// because this is only used for threshold *values*, not the counters
// themselves -- the counters are always read/written fresh, inside the
// transaction, with row locks.
const CONFIG_TTL_MS = 30_000;
let cachedConfig: RateLimitConfigRow | null = null;
let cachedConfigAt = 0;

async function getConfig(
  tx: Prisma.TransactionClient
): Promise<RateLimitConfigRow> {
  const now = Date.now();
  if (cachedConfig && now - cachedConfigAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }
  const row = await tx.rateLimitConfig.findUniqueOrThrow({ where: { id: 1 } });
  cachedConfig = {
    globalRpmLimit: row.globalRpmLimit,
    globalTpmLimit: row.globalTpmLimit,
    globalRpdLimit: row.globalRpdLimit,
    userDailyReqLimit: row.userDailyReqLimit,
    userDailyTokenLimit: row.userDailyTokenLimit,
  };
  cachedConfigAt = now;
  return cachedConfig;
}

function currentMinuteBucketStart(): Date {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000);
}

function currentUtcDate(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSerializationFailure(err: unknown): boolean {
  // Prisma surfaces Postgres SERIALIZABLE conflicts (SQLSTATE 40001) two
  // different ways depending on the query path:
  //   - ORM calls (e.g. `$transaction`'s own retryable writes) -> code P2034
  //     ("Transaction failed due to a write conflict or a deadlock. Please
  //     retry your transaction").
  //   - `$queryRaw`/`$executeRaw` (what this module uses for the atomic
  //     upsert-and-lock statements) -> code P2010 ("Raw query failed"),
  //     wrapping the underlying driver error, whose message/meta contains
  //     SQLSTATE 40001 / "could not serialize access due to concurrent
  //     update" / "TransactionWriteConflict".
  // Under Serializable isolation, two concurrent transactions racing to
  // lock/update the same GlobalRateBucket / GlobalDailyUsage / UserDailyUsage
  // row will not silently interleave -- the loser gets one of these errors
  // and must retry, re-reading the now-committed counters. This is what
  // makes the limit check race-safe rather than "read in JS, compute, write
  // back".
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === "P2034") return true;
  if (err.code === "P2010") {
    const haystack = `${err.message} ${JSON.stringify(err.meta ?? {})}`;
    return (
      haystack.includes("40001") ||
      haystack.includes("could not serialize access") ||
      haystack.includes("TransactionWriteConflict") ||
      haystack.includes("deadlock detected")
    );
  }
  return false;
}

/**
 * Runs `fn` inside a Serializable transaction, retrying on Postgres
 * serialization failures (concurrent writers to the same counter row).
 */
async function runSerializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 10_000,
      });
    } catch (err) {
      if (isSerializationFailure(err) && attempt < maxAttempts) {
        // Small jittered backoff before retrying.
        await sleep(10 + Math.random() * 40);
        continue;
      }
      throw err;
    }
  }
  // Unreachable, but keeps TypeScript happy.
  throw new Error("runSerializableTransaction: exhausted retries");
}

/**
 * Atomically checks + consumes both the global (RPM/TPM/RPD) and per-user daily
 * limits for one chat request, using `estimatedTokens` as a pre-flight estimate.
 * Must be race-safe under concurrent requests (Postgres row locks / SERIALIZABLE
 * transaction, NOT in-memory counters -- Next.js may run multiple processes).
 */
export async function checkAndConsumeLimits(
  userId: string,
  estimatedTokens: number
): Promise<RateLimitResult> {
  const bucketStart = currentMinuteBucketStart();
  const today = currentUtcDate();

  return runSerializableTransaction(async (tx) => {
    const config = await getConfig(tx);

    // Opportunistic cleanup of old per-minute buckets (~1% of calls).
    if (Math.random() < 0.01) {
      await tx.$executeRaw`
        DELETE FROM "GlobalRateBucket"
        WHERE "bucketStart" < now() - interval '1 hour'
      `;
    }

    // --- 1. Global per-minute bucket (RPM/TPM) ---
    // Lock (or create) the row for the current minute.
    const globalBucketRows = await tx.$queryRaw<
      { requestCount: number; tokenCount: number }[]
    >`
      INSERT INTO "GlobalRateBucket" ("id", "bucketStart", "requestCount", "tokenCount")
      VALUES (gen_random_uuid()::text, ${bucketStart}, 0, 0)
      ON CONFLICT ("bucketStart") DO UPDATE SET "bucketStart" = EXCLUDED."bucketStart"
      RETURNING "requestCount", "tokenCount"
      `;
    const globalBucket = globalBucketRows[0];

    if (
      globalBucket.requestCount + 1 > config.globalRpmLimit ||
      globalBucket.tokenCount + estimatedTokens > config.globalTpmLimit
    ) {
      return { allowed: false, reason: "GLOBAL_RPM_TPM" };
    }

    // --- 2. Global daily usage (RPD) ---
    const globalDailyRows = await tx.$queryRaw<
      { requestCount: number; tokenCount: number }[]
    >`
      INSERT INTO "GlobalDailyUsage" ("date", "requestCount", "tokenCount")
      VALUES (${today}, 0, 0)
      ON CONFLICT ("date") DO UPDATE SET "date" = EXCLUDED."date"
      RETURNING "requestCount", "tokenCount"
      `;
    const globalDaily = globalDailyRows[0];

    if (globalDaily.requestCount + 1 > config.globalRpdLimit) {
      return { allowed: false, reason: "GLOBAL_RPD" };
    }

    // --- 3. Per-user daily usage ---
    const userDailyRows = await tx.$queryRaw<
      { requestCount: number; tokenCount: number }[]
    >`
      INSERT INTO "UserDailyUsage" ("id", "userId", "date", "requestCount", "tokenCount")
      VALUES (gen_random_uuid()::text, ${userId}, ${today}, 0, 0)
      ON CONFLICT ("userId", "date") DO UPDATE SET "userId" = EXCLUDED."userId"
      RETURNING "requestCount", "tokenCount"
      `;
    const userDaily = userDailyRows[0];

    if (userDaily.requestCount + 1 > config.userDailyReqLimit) {
      return { allowed: false, reason: "USER_DAILY_REQ" };
    }
    if (userDaily.tokenCount + estimatedTokens > config.userDailyTokenLimit) {
      return { allowed: false, reason: "USER_DAILY_TOKEN" };
    }

    // --- 4. All checks passed: atomically increment all three counters ---
    await tx.$executeRaw`
      UPDATE "GlobalRateBucket"
      SET "requestCount" = "requestCount" + 1,
          "tokenCount" = "tokenCount" + ${estimatedTokens}
      WHERE "bucketStart" = ${bucketStart}
      `;
    await tx.$executeRaw`
      UPDATE "GlobalDailyUsage"
      SET "requestCount" = "requestCount" + 1,
          "tokenCount" = "tokenCount" + ${estimatedTokens}
      WHERE "date" = ${today}
      `;
    await tx.$executeRaw`
      UPDATE "UserDailyUsage"
      SET "requestCount" = "requestCount" + 1,
          "tokenCount" = "tokenCount" + ${estimatedTokens}
      WHERE "userId" = ${userId} AND "date" = ${today}
      `;

    return { allowed: true };
  });
}

/**
 * Called after Gemini returns real usageMetadata, to correct the counters that
 * were bumped with `estimatedTokens` in checkAndConsumeLimits so aggregate
 * numbers (used by both enforcement and the admin dashboard) stay accurate.
 * This is bookkeeping only -- the request already happened, so limits are not
 * re-checked here. Token counts are clamped so they never go negative.
 */
export async function reconcileUsage(params: {
  userId: string;
  estimatedTokens: number;
  actualTokens: number;
}): Promise<void> {
  const { userId, estimatedTokens, actualTokens } = params;
  const delta = actualTokens - estimatedTokens;
  if (delta === 0) return;

  const bucketStart = currentMinuteBucketStart();
  const today = currentUtcDate();

  await runSerializableTransaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "GlobalRateBucket"
      SET "tokenCount" = GREATEST("tokenCount" + ${delta}, 0)
      WHERE "bucketStart" = ${bucketStart}
      `;
    await tx.$executeRaw`
      UPDATE "GlobalDailyUsage"
      SET "tokenCount" = GREATEST("tokenCount" + ${delta}, 0)
      WHERE "date" = ${today}
      `;
    await tx.$executeRaw`
      UPDATE "UserDailyUsage"
      SET "tokenCount" = GREATEST("tokenCount" + ${delta}, 0)
      WHERE "userId" = ${userId} AND "date" = ${today}
      `;
  });
}
