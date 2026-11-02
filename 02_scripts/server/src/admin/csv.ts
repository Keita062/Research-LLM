import type { StoredEvent } from "../store/types.js";

export interface CsvColumn {
  key: string;
  label: string;
  defaultOn: boolean;
  get: (e: StoredEvent) => unknown;
}

const p = (k: string) => (e: StoredEvent) => e.payload[k];

export const CSV_COLUMNS: CsvColumn[] = [
  { key: "event_id", label: "イベントID", defaultOn: true, get: (e) => e.eventId },
  { key: "participant_id", label: "研究用ID", defaultOn: true, get: (e) => e.participantId },
  { key: "session_id", label: "セッションID", defaultOn: true, get: (e) => e.sessionId },
  { key: "conversation_id", label: "会話ID", defaultOn: true, get: (e) => e.conversationId },
  { key: "turn_index", label: "ターン番号", defaultOn: true, get: (e) => e.turnIndex },
  { key: "type", label: "種別", defaultOn: true, get: (e) => e.type },
  { key: "occurred_at", label: "発生時刻", defaultOn: true, get: (e) => e.occurredAt },
  { key: "received_at", label: "受信時刻", defaultOn: false, get: (e) => e.receivedAt },
  { key: "tool_name", label: "ツール名", defaultOn: true, get: p("toolName") },
  { key: "decision", label: "承認判断", defaultOn: true, get: p("decision") },
  { key: "decision_ms", label: "判断時間(ms)", defaultOn: true, get: p("decisionMs") },
  { key: "success", label: "成否", defaultOn: true, get: p("success") },
  { key: "duration_ms", label: "所要時間(ms)", defaultOn: true, get: p("durationMs") },
  { key: "chars", label: "文字数", defaultOn: true, get: p("chars") },
  { key: "output_type", label: "出力タイプ", defaultOn: true, get: p("outputType") },
  { key: "lines_added", label: "追加行数", defaultOn: true, get: p("linesAdded") },
  { key: "lines_removed", label: "削除行数", defaultOn: true, get: p("linesRemoved") },
  { key: "exit_code", label: "終了コード", defaultOn: true, get: p("exitCode") },
  { key: "file_extension", label: "ファイル拡張子", defaultOn: false, get: p("fileExtension") },
  { key: "input_tokens", label: "入力トークン", defaultOn: false, get: p("inputTokens") },
  { key: "output_tokens", label: "出力トークン", defaultOn: false, get: p("outputTokens") },
  { key: "model", label: "モデル", defaultOn: false, get: p("model") },
  { key: "environment", label: "拡張/VS Code/OS", defaultOn: false, get: (e) => [e.extensionVersion, e.vscodeVersion, e.os].join("/") },
  { key: "payload_json", label: "payload(JSON全体)", defaultOn: false, get: (e) => JSON.stringify(e.payload) },
  { key: "content_text", label: "本文", defaultOn: false, get: (e) => e.content?.text },
  { key: "content_feedback", label: "修正指示の本文", defaultOn: false, get: (e) => e.content?.feedback },
  { key: "content_attachments", label: "添付画像ID", defaultOn: false, get: (e) => e.content?.attachments },
];

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(events: StoredEvent[], keys: string[]): string {
  const cols = CSV_COLUMNS.filter((c) => keys.includes(c.key));
  const lines = [cols.map((c) => cell(c.key)).join(",")];
  for (const e of events) lines.push(cols.map((c) => cell(c.get(e))).join(","));
  // Excel で文字化けしないよう BOM を付ける
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
