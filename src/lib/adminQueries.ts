import "server-only";
import { prisma } from "@/lib/db";
import { Prisma, type Role } from "@/generated/prisma/client";

/**
 * Query + aggregation helpers for the admin dashboard (FR-17〜FR-20).
 * Kept separate from the page components so page.tsx / actions/admin.ts stay
 * focused on wiring rather than SQL.
 */

// ---------------------------------------------------------------------------
// Users (FR-18, FR-20)
// ---------------------------------------------------------------------------

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  role: Role;
};

export async function getUsersList(): Promise<AdminUserRow[]> {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      emailVerifiedAt: true,
      isActive: true,
      lastLoginAt: true,
      role: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Usage time series (FR-19a)
// ---------------------------------------------------------------------------

export const USAGE_UNITS = ["day", "week", "month"] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];

export function isUsageUnit(value: string | undefined | null): value is UsageUnit {
  return value != null && (USAGE_UNITS as readonly string[]).includes(value);
}

export type UsageBucket = {
  bucket: string; // ISO timestamp
  requestCount: number;
  tokenCount: number;
};

const UNIT_LOOKBACK_DAYS: Record<UsageUnit, number> = {
  day: 30,
  week: 90,
  month: 365,
};

// One literal Prisma.Sql fragment per allowlisted unit. Because `unit` is
// validated against USAGE_UNITS (isUsageUnit) *before* this map is indexed,
// no untrusted string ever reaches the query — we never bind the raw user
// string into date_trunc()'s first argument.
const TRUNC_UNIT_LITERAL: Record<UsageUnit, Prisma.Sql> = {
  day: Prisma.sql`'day'`,
  week: Prisma.sql`'week'`,
  month: Prisma.sql`'month'`,
};

type RawUsageRow = {
  bucket: Date;
  request_count: bigint;
  token_count: bigint | null;
};

export async function getUsageTimeSeries(unit: UsageUnit): Promise<UsageBucket[]> {
  if (!isUsageUnit(unit)) {
    // Defense in depth: callers must validate against USAGE_UNITS first, but
    // never trust a caller blindly when the value drives SQL construction.
    throw new Error(`invalid usage unit: ${String(unit)}`);
  }

  const since = new Date(Date.now() - UNIT_LOOKBACK_DAYS[unit] * 24 * 60 * 60 * 1000);
  const truncUnit = TRUNC_UNIT_LITERAL[unit];

  const rows = await prisma.$queryRaw<RawUsageRow[]>(Prisma.sql`
    SELECT
      date_trunc(${truncUnit}, "createdAt") AS bucket,
      COUNT(*) AS request_count,
      COALESCE(SUM("totalTokens"), 0) AS token_count
    FROM "UsageLog"
    WHERE "createdAt" >= ${since}
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  return rows.map((r) => ({
    bucket: r.bucket.toISOString(),
    requestCount: Number(r.request_count),
    tokenCount: Number(r.token_count ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Per-user usage ranking (FR-19b)
// ---------------------------------------------------------------------------

export type UserRankingRow = {
  userId: string;
  name: string;
  email: string;
  totalTokens: number;
  requestCount: number;
};

export async function getUserUsageRanking(limit = 20): Promise<UserRankingRow[]> {
  const grouped = await prisma.usageLog.groupBy({
    by: ["userId"],
    _sum: { totalTokens: true },
    _count: { id: true },
    orderBy: { _sum: { totalTokens: "desc" } },
    take: limit,
  });

  if (grouped.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return grouped.map((g) => {
    const user = byId.get(g.userId);
    return {
      userId: g.userId,
      name: user?.name ?? "(削除済みユーザー)",
      email: user?.email ?? "",
      totalTokens: g._sum.totalTokens ?? 0,
      requestCount: g._count.id,
    };
  });
}

// ---------------------------------------------------------------------------
// Free-tier consumption widget (FR-19c) — reads the exact tables the rate
// limiter (Agent-RateLimit) enforces against, so the admin view always
// matches real enforcement.
// ---------------------------------------------------------------------------

export type RateLimitConfigDTO = {
  globalRpmLimit: number;
  globalTpmLimit: number;
  globalRpdLimit: number;
  userDailyReqLimit: number;
  userDailyTokenLimit: number;
  updatedAt: Date;
};

export type FreeTierConsumption = {
  config: RateLimitConfigDTO | null;
  today: { requestCount: number; tokenCount: number };
  currentMinute: { requestCount: number; tokenCount: number };
};

export async function getFreeTierConsumption(): Promise<FreeTierConsumption> {
  const [config, dailyRows, minuteRows] = await Promise.all([
    prisma.rateLimitConfig.findUnique({ where: { id: 1 } }),
    // GlobalDailyUsage.date is keyed by UTC calendar day; compare against the
    // DB's own CURRENT_DATE rather than a JS-computed date to avoid clock/TZ
    // skew against whatever the rate limiter used to write the row.
    prisma.$queryRaw<{ requestCount: number; tokenCount: number }[]>(Prisma.sql`
      SELECT "requestCount", "tokenCount"
      FROM "GlobalDailyUsage"
      WHERE "date" = CURRENT_DATE
      LIMIT 1
    `),
    prisma.$queryRaw<{ requestCount: number; tokenCount: number }[]>(Prisma.sql`
      SELECT "requestCount", "tokenCount"
      FROM "GlobalRateBucket"
      WHERE "bucketStart" = date_trunc('minute', now())
      LIMIT 1
    `),
  ]);

  return {
    config,
    today: {
      requestCount: dailyRows[0]?.requestCount ?? 0,
      tokenCount: dailyRows[0]?.tokenCount ?? 0,
    },
    currentMinute: {
      requestCount: minuteRows[0]?.requestCount ?? 0,
      tokenCount: minuteRows[0]?.tokenCount ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Rate limit config editor (FR-16)
// ---------------------------------------------------------------------------

export type RateLimitConfigInput = {
  globalRpmLimit: number;
  globalTpmLimit: number;
  globalRpdLimit: number;
  userDailyReqLimit: number;
  userDailyTokenLimit: number;
};

export async function updateRateLimitConfig(data: RateLimitConfigInput) {
  return prisma.rateLimitConfig.update({
    where: { id: 1 },
    data,
  });
}

// ---------------------------------------------------------------------------
// Chat content sample viewer (FR-19d / NFR-05) — sensitive personal data.
// Scoped to exactly one user at a time, never surfaced inline in the ranking.
// ---------------------------------------------------------------------------

export type MessageSample = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: Date;
  conversation: { id: string; title: string };
};

export async function getUserMessageSamples(userId: string): Promise<{
  user: { id: string; name: string; email: string } | null;
  messages: MessageSample[];
}> {
  const [user, messages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
    prisma.message.findMany({
      where: { conversation: { userId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { conversation: { select: { id: true, title: true } } },
    }),
  ]);

  return {
    user,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      conversation: m.conversation,
    })),
  };
}
