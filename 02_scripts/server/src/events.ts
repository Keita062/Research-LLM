import type { Participant, StoredEvent } from "./store/types.js";

export const EVENT_TYPES = [
  "session_start",
  "session_end",
  "conversation_start",
  "user_prompt",
  "model_response",
  "tool_call",
  "tool_decision",
  "tool_result",
  "user_cancel",
  "error",
  "consent_changed",
  "collection_paused",
  "collection_resumed",
  "buffer_dropped",
] as const;

export const CONTENT_KEYS = ["text", "feedback"] as const;

export interface ClientEvent {
  eventId: string;
  sessionId: string;
  conversationId?: string | null;
  turnIndex?: number | null;
  type: string;
  occurredAt: string;
  extensionVersion?: string;
  vscodeVersion?: string;
  os?: string;
  payload?: Record<string, unknown>;
  content?: Record<string, unknown> | null;
}

function limitedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(payload);
  return json.length <= 10_000 ? (JSON.parse(json) as Record<string, unknown>) : { truncated: true };
}

const RETENTION_MS = 365 * 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown, max = 100): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

/**
 * 拡張から届いたイベントを検証し、同意状態に従ってフィルタする。
 * メタデータ未同意なら全件破棄、本文未同意なら本文を落とす（拡張側のフィルタに加えた二重の防御）
 */
export function sanitizeEvents(
  input: unknown[],
  participant: Participant,
  now: Date,
): StoredEvent[] {
  const consent = participant.consent;
  if (!consent || !consent.metadata) return [];
  if (participant.status !== "active") return [];
  const receivedAt = now.toISOString();
  const expireAt = new Date(now.getTime() + RETENTION_MS).toISOString();
  const out: StoredEvent[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as ClientEvent;
    if (typeof e.eventId !== "string" || !UUID.test(e.eventId)) continue;
    if (!(EVENT_TYPES as readonly string[]).includes(e.type)) continue;
    const occurred = new Date(e.occurredAt);
    if (Number.isNaN(occurred.getTime())) continue;
    let content: Record<string, string> | null = null;
    if (consent.content && e.content && typeof e.content === "object") {
      content = {};
      for (const k of CONTENT_KEYS) {
        const v = e.content[k];
        if (typeof v === "string") content[k] = v.slice(0, 100_000);
      }
      if (Object.keys(content).length === 0) content = null;
    }
    const payload = e.payload && typeof e.payload === "object" ? e.payload : {};
    out.push({
      eventId: e.eventId.toLowerCase(),
      participantId: participant.id,
      sessionId: str(e.sessionId) ?? "",
      conversationId: str(e.conversationId),
      turnIndex: typeof e.turnIndex === "number" ? e.turnIndex : null,
      type: e.type,
      occurredAt: occurred.toISOString(),
      receivedAt,
      expireAt,
      extensionVersion: str(e.extensionVersion, 20),
      vscodeVersion: str(e.vscodeVersion, 20),
      os: str(e.os, 20),
      payload: limitedPayload(payload),
      content,
    });
  }
  return out;
}
