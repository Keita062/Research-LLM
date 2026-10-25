import type { Consent, Participant, Settings } from "./store/types.js";

export type DenyReason = "global_stopped" | "stopped" | "withdrawn" | "not_activated" | "consent_required";

export function hasRequiredConsent(consent: Consent | null, settings: Settings): boolean {
  if (!consent) return false;
  if (settings.requireFullConsent) return consent.use && consent.metadata && consent.content;
  return consent.use;
}

export function evaluateAccess(p: Participant, settings: Settings): { allowed: true } | { allowed: false; reason: DenyReason } {
  if (p.status === "withdrawn") return { allowed: false, reason: "withdrawn" };
  if (p.status === "stopped") return { allowed: false, reason: "stopped" };
  if (p.status === "invited") return { allowed: false, reason: "not_activated" };
  if (settings.globalStopped) return { allowed: false, reason: "global_stopped" };
  if (!hasRequiredConsent(p.consent, settings)) return { allowed: false, reason: "consent_required" };
  return { allowed: true };
}

/** 同意内容の変更後の参加者状態。撤回は利用停止（研究者の決定、要件定義書 FR-05） */
export function statusAfterConsent(p: Participant, consent: Consent, settings: Settings): Participant["status"] {
  if (p.status === "withdrawn" || p.status === "stopped") return p.status;
  return hasRequiredConsent(consent, settings) ? "active" : "withdrawn";
}

/** 1 インスタンス内の直近 1 分間のリクエスト数（Cloud Run は max-instances=1 で運用） */
export class MinuteWindow {
  private stamps: number[] = [];

  tryAcquire(limit: number, now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < 60_000);
    if (this.stamps.length >= limit) return false;
    this.stamps.push(now);
    return true;
  }
}
