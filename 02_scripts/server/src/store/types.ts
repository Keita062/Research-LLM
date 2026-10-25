export type ParticipantStatus = "invited" | "active" | "stopped" | "withdrawn";

export interface Consent {
  use: boolean;
  metadata: boolean;
  content: boolean;
  updatedAt: string;
}

export interface Participant {
  id: string;
  status: ParticipantStatus;
  inviteCodeHash: string | null;
  tokenHash: string | null;
  consent: Consent | null;
  deletionRequested: boolean;
  createdAt: string;
  activatedAt: string | null;
  lastSeenAt: string | null;
  lastEventAt: string | null;
  extensionVersion: string | null;
}

export interface Settings {
  globalStopped: boolean;
  model: string;
  globalRequestsPerMinute: number;
  globalRequestsPerDay: number;
  perUserRequestsPerDay: number;
  perUserTokensPerDay: number;
  minExtensionVersion: string;
  requireFullConsent: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  globalStopped: false,
  model: "gemini-2.5-flash",
  globalRequestsPerMinute: 10,
  globalRequestsPerDay: 250,
  perUserRequestsPerDay: 80,
  perUserTokensPerDay: 2_000_000,
  minExtensionVersion: "0.1.0",
  requireFullConsent: true,
};

export interface StoredEvent {
  eventId: string;
  participantId: string;
  sessionId: string;
  conversationId: string | null;
  turnIndex: number | null;
  type: string;
  occurredAt: string;
  receivedAt: string;
  expireAt: string;
  extensionVersion: string | null;
  vscodeVersion: string | null;
  os: string | null;
  payload: Record<string, unknown>;
  content: Record<string, string> | null;
}

export interface Usage {
  requests: number;
  tokens: number;
}

export interface EventQuery {
  participantId?: string;
  types?: string[];
  from?: string;
  to?: string;
  limit?: number;
}

export interface Store {
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  nextParticipantId(): Promise<string>;
  createParticipant(p: Participant): Promise<void>;
  getParticipant(id: string): Promise<Participant | null>;
  findParticipantByTokenHash(hash: string): Promise<Participant | null>;
  findParticipantByInviteHash(hash: string): Promise<Participant | null>;
  updateParticipant(id: string, patch: Partial<Participant>): Promise<void>;
  listParticipants(): Promise<Participant[]>;
  deleteParticipant(id: string): Promise<void>;

  /** 既存の eventId は無視する。新規に保存した件数を返す */
  insertEvents(events: StoredEvent[]): Promise<number>;
  queryEvents(q: EventQuery): Promise<StoredEvent[]>;
  countEvents(participantId: string, sinceIso: string): Promise<number>;

  addUsage(key: string, requests: number, tokens: number): Promise<Usage>;
  getUsage(key: string): Promise<Usage>;
}
