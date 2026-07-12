"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIsDarkMode } from "./useIsDarkMode";
import type { UsageBucket, UsageUnit } from "@/lib/adminQueries";

// Sequential single-hue per chart (each chart is one series — "trend over
// time" job from the dataviz form heuristic). Two different metrics
// (requests vs. tokens) get two different hues and two separate charts
// rather than one chart with a second y-axis (never dual-axis).
const REQUEST_HUE = { light: "#2a78d6", dark: "#3987e5" }; // categorical slot 1: blue
const TOKEN_HUE = { light: "#1baf7a", dark: "#199e70" }; // categorical slot 2: aqua

const GRID = { light: "#e1e0d9", dark: "#2c2c2a" };
const AXIS_TEXT = "#898781";
const SURFACE = { light: "#fcfcfb", dark: "#1a1a1a" };

function tickFormatter(unit: UsageUnit) {
  return (iso: string) => {
    const d = new Date(iso);
    if (unit === "month") {
      return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short" }).format(d);
    }
    if (unit === "week") {
      return `${new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(d)}週`;
    }
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(d);
  };
}

function tooltipFormatter(unit: UsageUnit) {
  return (iso: string) => {
    const d = new Date(iso);
    if (unit === "month") {
      return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(d);
    }
    if (unit === "week") {
      return `${new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" }).format(d)} 週`;
    }
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" }).format(d);
  };
}

function compact(n: number): string {
  return new Intl.NumberFormat("ja-JP", { notation: "compact" }).format(n);
}

function OneSeriesTooltip({
  active,
  payload,
  label,
  unit,
  valueLabel,
  color,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
  unit: UsageUnit;
  valueLabel: string;
  color: string;
}) {
  if (!active || !payload || payload.length === 0 || label === undefined) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-md border border-black/10 bg-[#fcfcfb] px-3 py-2 text-xs shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="text-[#898781]">{tooltipFormatter(unit)(label)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[#0b0b0b] dark:text-white">
        <span aria-hidden className="inline-block h-0.5 w-3" style={{ backgroundColor: color }} />
        <span className="font-semibold tabular-nums">{new Intl.NumberFormat("ja-JP").format(value)}</span>
        <span className="text-[#898781]">{valueLabel}</span>
      </div>
    </div>
  );
}

function SingleSeriesAreaChart({
  data,
  unit,
  dataKey,
  hue,
  valueLabel,
}: {
  data: UsageBucket[];
  unit: UsageUnit;
  dataKey: "requestCount" | "tokenCount";
  hue: { light: string; dark: string };
  valueLabel: string;
}) {
  const isDark = useIsDarkMode();
  const color = isDark ? hue.dark : hue.light;
  const grid = isDark ? GRID.dark : GRID.light;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.1} />
            <stop offset="100%" stopColor={color} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={grid} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={tickFormatter(unit)}
          tick={{ fill: AXIS_TEXT, fontSize: 12 }}
          axisLine={{ stroke: grid }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={compact}
          tick={{ fill: AXIS_TEXT, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ stroke: grid }}
          content={<OneSeriesTooltip unit={unit} valueLabel={valueLabel} color={color} />}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#fill-${dataKey})`}
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: isDark ? SURFACE.dark : SURFACE.light, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * FR-19a: request-count and token-count trends. Two single-series area
 * charts rather than one dual-axis chart — requests and tokens live on
 * different scales and a second y-axis is never the answer.
 */
export function TimeSeriesCharts({ data, unit }: { data: UsageBucket[]; unit: UsageUnit }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-[#fcfcfb] p-8 text-center text-sm text-[#898781] dark:border-white/10 dark:bg-[#1a1a1a]">
        この期間の利用ログはまだありません。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
        <h3 className="mb-2 text-sm font-medium text-[#52514e] dark:text-[#c3c2b7]">
          リクエスト数の推移
        </h3>
        <SingleSeriesAreaChart
          data={data}
          unit={unit}
          dataKey="requestCount"
          hue={REQUEST_HUE}
          valueLabel="件"
        />
      </div>
      <div className="rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
        <h3 className="mb-2 text-sm font-medium text-[#52514e] dark:text-[#c3c2b7]">
          トークン使用量の推移
        </h3>
        <SingleSeriesAreaChart
          data={data}
          unit={unit}
          dataKey="tokenCount"
          hue={TOKEN_HUE}
          valueLabel="トークン"
        />
      </div>
    </div>
  );
}
