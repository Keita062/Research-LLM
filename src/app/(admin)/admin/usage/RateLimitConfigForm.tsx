import { updateRateLimitConfigAction } from "@/actions/admin";
import type { RateLimitConfigDTO } from "@/lib/adminQueries";

type NumericField = Exclude<keyof RateLimitConfigDTO, "updatedAt">;

const FIELDS: {
  name: NumericField;
  label: string;
  hint: string;
}[] = [
  { name: "globalRpmLimit", label: "グローバル RPM 上限", hint: "全体の1分あたりリクエスト数" },
  { name: "globalTpmLimit", label: "グローバル TPM 上限", hint: "全体の1分あたりトークン数" },
  { name: "globalRpdLimit", label: "グローバル RPD 上限", hint: "全体の1日あたりリクエスト数" },
  { name: "userDailyReqLimit", label: "ユーザー別 1日リクエスト上限", hint: "ユーザー1人あたりの1日のリクエスト数" },
  { name: "userDailyTokenLimit", label: "ユーザー別 1日トークン上限", hint: "ユーザー1人あたりの1日のトークン数" },
];

/** FR-16: edits the single RateLimitConfig row (id=1). */
export function RateLimitConfigForm({ config }: { config: RateLimitConfigDTO | null }) {
  return (
    <form
      action={updateRateLimitConfigAction}
      className="grid grid-cols-1 gap-4 rounded-lg border border-black/10 bg-[#fcfcfb] p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/10 dark:bg-[#1a1a1a]"
    >
      {FIELDS.map((field) => (
        <label key={field.name} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#0b0b0b] dark:text-white">{field.label}</span>
          <input
            type="number"
            name={field.name}
            min={1}
            step={1}
            required
            defaultValue={config?.[field.name] ?? undefined}
            className="rounded-md border border-black/10 bg-[#fcfcfb] px-3 py-2 tabular-nums text-[#0b0b0b] outline-none focus:border-[#2a78d6] dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white dark:focus:border-[#3987e5]"
          />
          <span className="text-xs text-[#898781]">{field.hint}</span>
        </label>
      ))}

      <div className="flex items-end sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          className="rounded-md bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256abf] dark:bg-[#3987e5] dark:hover:bg-[#2a78d6]"
        >
          設定を保存
        </button>
        {config ? (
          <span className="ml-4 self-center text-xs text-[#898781]">
            最終更新: {new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(config.updatedAt)}
          </span>
        ) : null}
      </div>
    </form>
  );
}
