import {
  DEFAULT_SETTINGS,
  type EventQuery,
  type Participant,
  type Settings,
  type Store,
  type StoredEvent,
  type Usage,
} from "./types.js";

export class MemoryStore implements Store {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private participants = new Map<string, Participant>();
  private events = new Map<string, StoredEvent>();
  private usage = new Map<string, Usage>();
  private counter = 0;

  async getSettings() {
    return { ...this.settings };
  }

  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    return { ...this.settings };
  }

  async nextParticipantId() {
    this.counter += 1;
    return `P${String(this.counter).padStart(3, "0")}`;
  }

  async createParticipant(p: Participant) {
    this.participants.set(p.id, { ...p });
  }

  async getParticipant(id: string) {
    const p = this.participants.get(id);
    return p ? { ...p } : null;
  }

  async findParticipantByTokenHash(hash: string) {
    for (const p of this.participants.values()) if (p.tokenHash === hash) return { ...p };
    return null;
  }

  async findParticipantByInviteHash(hash: string) {
    for (const p of this.participants.values()) if (p.inviteCodeHash === hash) return { ...p };
    return null;
  }

  async updateParticipant(id: string, patch: Partial<Participant>) {
    const p = this.participants.get(id);
    if (!p) throw new Error(`participant not found: ${id}`);
    this.participants.set(id, { ...p, ...patch });
  }

  async listParticipants() {
    return [...this.participants.values()].map((p) => ({ ...p })).sort((a, b) => a.id.localeCompare(b.id));
  }

  async deleteParticipant(id: string) {
    this.participants.delete(id);
    for (const [k, e] of this.events) if (e.participantId === id) this.events.delete(k);
  }

  async insertEvents(events: StoredEvent[]) {
    let inserted = 0;
    for (const e of events) {
      if (this.events.has(e.eventId)) continue;
      this.events.set(e.eventId, e);
      inserted += 1;
    }
    return inserted;
  }

  async queryEvents(q: EventQuery) {
    let list = [...this.events.values()].filter((e) => {
      if (q.participantId && e.participantId !== q.participantId) return false;
      if (q.types && q.types.length > 0 && !q.types.includes(e.type)) return false;
      if (q.from && e.occurredAt < q.from) return false;
      if (q.to && e.occurredAt > q.to) return false;
      return true;
    });
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    if (q.limit) list = list.slice(-q.limit);
    return list;
  }

  async countEvents(participantId: string, sinceIso: string) {
    let n = 0;
    for (const e of this.events.values()) if (e.participantId === participantId && e.receivedAt >= sinceIso) n += 1;
    return n;
  }

  async addUsage(key: string, requests: number, tokens: number) {
    const u = this.usage.get(key) ?? { requests: 0, tokens: 0 };
    const next = { requests: u.requests + requests, tokens: u.tokens + tokens };
    this.usage.set(key, next);
    return { ...next };
  }

  async getUsage(key: string) {
    return { ...(this.usage.get(key) ?? { requests: 0, tokens: 0 }) };
  }
}
