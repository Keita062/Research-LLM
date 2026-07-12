"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsDarkMode } from "./useIsDarkMode";
import type { UserRankingRow } from "@/lib/adminQueries";

// Ranking bars are all the same metric (total tokens) split by user, not
// distinct series — "compare magnitude" job, sequential single hue.
const HUE = { light: "#2a78d6", dark: "#3987e5" };
const GRID = { light: "#e1e0d9", dark: "#2c2c2a" };
const AXIS_TEXT = "#898781";

function truncateName(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function RankingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: UserRankingRow }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-md border border-black/10 bg-[#fcfcfb] px-3 py-2 text-xs shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="font-medium text-[#0b0b0b] dark:text-white">{row.name}</div>
      <div className="text-[#898781]">{row.email}</div>
      <div className="mt-1 text-[#0b0b0b] dark:text-white">
        <span className="font-semibold tabular-nums">
          {new Intl.NumberFormat("ja-JP").format(row.totalTokens)}
        </span>{" "}
        トークン ・ {new Intl.NumberFormat("ja-JP").format(row.requestCount)} 件
      </div>
    </div>
  );
}

/** FR-19b: per-user usage ranking, horizontal bar (top N by total tokens). */
export function RankingChart({ data }: { data: UserRankingRow[] }) {
  const isDark = useIsDarkMode();
  const color = isDark ? HUE.dark : HUE.light;
  const grid = isDark ? GRID.dark : GRID.light;

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-[#fcfcfb] p-8 text-center text-sm text-[#898781] dark:border-white/10 dark:bg-[#1a1a1a]">
        利用ログがまだありません。
      </div>
    );
  }

  const chartData = data.map((row) => ({ ...row, displayName: truncateName(row.name) }));
  const height = Math.max(chartData.length * 32 + 24, 120);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap={8}>
        <CartesianGrid stroke={grid} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(n: number) => new Intl.NumberFormat("ja-JP", { notation: "compact" }).format(n)}
          tick={{ fill: AXIS_TEXT, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="displayName"
          tick={{ fill: AXIS_TEXT, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip cursor={{ fill: `${color}14` }} content={<RankingTooltip />} />
        <Bar dataKey="totalTokens" fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
          {chartData.map((row) => (
            <Cell key={row.userId} fill={color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
