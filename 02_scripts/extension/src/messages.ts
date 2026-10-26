import { ApiError } from "./apiClient";

export const DENY_MESSAGES: Record<string, string> = {
  withdrawn: "研究への同意を撤回したため、利用は停止されています。再開を希望する場合は研究者に連絡してください。",
  stopped: "研究者により利用が停止されています。詳しくは研究者にお問い合わせください。",
  global_stopped: "現在、研究者によりすべての参加者の利用が停止されています。",
  outdated: "新しいバージョンの拡張機能が必要です。研究者から配布された最新版をインストールしてください。",
};

const RATE_MESSAGES: Record<string, string> = {
  user_day: "本日の利用上限（リクエスト数）に達しました。明日（日本時間 16〜17 時ごろ）以降に再度お試しください。",
  user_tokens: "本日の利用上限（トークン数）に達しました。明日以降に再度お試しください。",
  global_day: "全参加者の本日の利用上限に達しました。明日以降に再度お試しください。",
  global_minute: "混み合っています。1分ほど待ってから再度お試しください。",
  upstream: "AI サービスが混み合っています。少し待ってから再度お試しください。",
};

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return RATE_MESSAGES[e.body.scope ?? "upstream"] ?? RATE_MESSAGES.upstream;
    if (e.status === 403 && e.body.reason) return DENY_MESSAGES[e.body.reason] ?? "現在は利用できません。";
    if (e.status === 401) return "認証が無効になりました。招待コードを入力し直してください。";
    return `サーバーでエラーが発生しました（${e.status}）。少し待ってから再度お試しください。`;
  }
  return "研究用サーバーに接続できませんでした。ネットワークを確認してください。";
}

/** UI 表示用の短い説明（ログには送らない） */
export function toolSummary(name: string, args: Record<string, unknown>): string {
  if (name === "run_command") return String(args.command ?? "");
  if (name === "search_files") return `"${String(args.query ?? "")}"`;
  return String(args.path ?? ".");
}
