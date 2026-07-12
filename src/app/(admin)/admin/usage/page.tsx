import Link from "next/link";
import { requireAdmin } from "@/lib/rbac";
import {
  USAGE_UNITS,
  getFreeTierConsumption,
  getUsageTimeSeries,
  getUserUsageRanking,
  isUsageUnit,
  type UsageUnit,
} from "@/lib/adminQueries";
import { TimeSeriesCharts } from "./TimeSeriesCharts";
import { RankingChart } from "./RankingChart";
import { Meter, StatTile } from "./Meter";
import { RateLimitConfigForm } from "./RateLimitConfigForm";

export const metadata = {
  title: "利用統計ダッシュボード | 管理画面",
};

const UNIT_LABEL: Record<UsageUnit, string> = {
  day: "日別",
  week: "週別",
  month: "月別",
};

const nf = new Intl.NumberFormat("ja-JP");

/**
 * FR-19: usage dashboard — time series (a), per-user ranking (b), free-tier
 * consumption (c), and the entry point to the chat-content sample viewer
 * (d, via "内容を見る" — never inline here per NFR-05). FR-16's rate-limit
 * config editor lives at the bottom since it's the same admin surface.
 */
export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  await requireAdmin();

  const { unit: rawUnit } = await searchParams;
  const unit: UsageUnit = isUsageUnit(rawUnit) ? rawUnit : "day";

  const [timeSeries, ranking, freeTier] = await Promise.all([
    getUsageTimeSeries(unit),
    getUserUsageRanking(20),
    getFreeTierConsumption(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold text-[#0b0b0b] dark:text-white">
          利用統計ダッシュボード
        </h1>
      </div>

      {/* --- FR-19a: time series ---------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#0b0b0b] dark:text-white">
            リクエスト数／トークン使用量の推移
          </h2>
          <div className="flex gap-1 rounded-md border border-black/10 p-1 dark:border-white/10">
            {USAGE_UNITS.map((u) => (
              <Link
                key={u}
                href={`/admin/usage?unit=${u}`}
                className={
                  "rounded px-3 py-1 text-sm font-medium transition-colors " +
                  (u === unit
                    ? "bg-[#2a78d6] text-white dark:bg-[#3987e5]"
                    : "text-[#52514e] hover:bg-black/5 dark:text-[#c3c2b7] dark:hover:bg-white/5")
                }
              >
                {UNIT_LABEL[u]}
              </Link>
            ))}
          </div>
        </div>
        <TimeSeriesCharts data={timeSeries} unit={unit} />
      </section>

      {/* --- FR-19b: per-user ranking + FR-19d entry point --------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[#0b0b0b] dark:text-white">
          ユーザー別の利用量ランキング（上位{ranking.length}名）
        </h2>
        <div className="rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
          <RankingChart data={ranking} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-black/10 bg-[#fcfcfb] dark:border-white/10 dark:bg-[#1a1a1a]">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e1e0d9] text-left text-[#52514e] dark:border-[#2c2c2a] dark:text-[#c3c2b7]">
                <th className="px-4 py-3 font-medium">順位</th>
                <th className="px-4 py-3 font-medium">氏名</th>
                <th className="px-4 py-3 font-medium">メール</th>
                <th className="px-4 py-3 text-right font-medium">リクエスト数</th>
                <th className="px-4 py-3 text-right font-medium">トークン数</th>
                <th className="px-4 py-3 font-medium">チャット内容</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row, i) => (
                <tr key={row.userId} className="border-b border-[#e1e0d9] last:border-0 dark:border-[#2c2c2a]">
                  <td className="px-4 py-3 tabular-nums text-[#898781]">{i + 1}</td>
                  <td className="px-4 py-3 text-[#0b0b0b] dark:text-white">{row.name}</td>
                  <td className="px-4 py-3 text-[#52514e] dark:text-[#c3c2b7]">{row.email}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#0b0b0b] dark:text-white">
                    {nf.format(row.requestCount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#0b0b0b] dark:text-white">
                    {nf.format(row.totalTokens)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/usage/samples/${row.userId}`}
                      className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-[#0b0b0b] transition-colors hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                    >
                      内容を見る
                    </Link>
                  </td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#898781]">
                    利用ログがまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- FR-19c: free-tier consumption -------------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[#0b0b0b] dark:text-white">
          無料枠上限に対する現在の消費率
        </h2>
        <p className="text-xs text-[#898781]">
          レート制限の実際の判定に使われているテーブル（GlobalRateBucket / GlobalDailyUsage）を直接参照しているため、
          ここに表示される値は実際の制御ロジックと常に一致します。
        </p>
        {freeTier.config ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Meter
              label="直近1分のリクエスト数（RPM）"
              value={freeTier.currentMinute.requestCount}
              limit={freeTier.config.globalRpmLimit}
              unit="req/分"
            />
            <Meter
              label="直近1分のトークン数（TPM）"
              value={freeTier.currentMinute.tokenCount}
              limit={freeTier.config.globalTpmLimit}
              unit="トークン/分"
            />
            <Meter
              label="本日のリクエスト数（RPD）"
              value={freeTier.today.requestCount}
              limit={freeTier.config.globalRpdLimit}
              unit="req/日"
            />
            <StatTile
              label="本日のトークン使用量（合算）"
              value={freeTier.today.tokenCount}
              note="グローバルな1日あたりトークン上限は未設定です（TPM上限で制御）"
            />
          </div>
        ) : (
          <p className="text-sm text-[#898781]">RateLimitConfig が未設定です。</p>
        )}
      </section>

      {/* --- FR-16: rate limit config editor ------------------------------ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[#0b0b0b] dark:text-white">
          レート制限設定
        </h2>
        <RateLimitConfigForm config={freeTier.config} />
      </section>
    </div>
  );
}
