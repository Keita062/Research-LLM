// Status colors per the dataviz skill's fixed status palette — identical hex
// in light and dark (validated against both surfaces), never reused for
// categorical series identity.
const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

function severityFor(ratio: number): { color: string; label: string } {
  if (ratio >= 1) return { color: STATUS.critical, label: "上限到達" };
  if (ratio >= 0.9) return { color: STATUS.critical, label: "危険域" };
  if (ratio >= 0.7) return { color: STATUS.warning, label: "注意" };
  return { color: STATUS.good, label: "正常" };
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat("ja-JP", { notation: "compact" }).format(n);
}

/**
 * Free-tier consumption meter (FR-19c). Fill carries severity
 * (good → warning → critical); the unfilled track is the same hue at low
 * opacity so state reads across the whole bar. Values + ratio are always
 * shown as text, never encoded by color alone.
 */
export function Meter({
  label,
  value,
  limit,
  unit,
}: {
  label: string;
  value: number;
  limit: number;
  unit?: string;
}) {
  const ratio = limit > 0 ? value / limit : 0;
  const pct = Math.min(ratio, 1) * 100;
  const { color, label: severityLabel } = severityFor(ratio);
  const overLimit = ratio >= 1;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[#52514e] dark:text-[#c3c2b7]">
          {label}
        </span>
        <span
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color }}
        >
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {severityLabel}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-[#0b0b0b] dark:text-white">
          {formatCompact(value)}
        </span>
        <span className="text-sm text-[#898781]">
          / {formatCompact(limit)} {unit}
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: `${color}26` /* ~15% opacity track */ }}
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${formatCompact(value)} / ${formatCompact(limit)}`}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      <span className="text-xs text-[#898781]">
        {(ratio * 100).toFixed(1)}% 消費{overLimit ? "（上限超過）" : ""}
      </span>
    </div>
  );
}

/** Plain informational stat tile (no configured limit to gauge against). */
export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a1a]">
      <span className="text-sm font-medium text-[#52514e] dark:text-[#c3c2b7]">
        {label}
      </span>
      <span className="text-2xl font-semibold text-[#0b0b0b] dark:text-white">
        {formatCompact(value)}
      </span>
      {note ? <span className="text-xs text-[#898781]">{note}</span> : null}
    </div>
  );
}
