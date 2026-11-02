import { FieldValue, Firestore, Timestamp } from "@google-cloud/firestore";
import {
  DEFAULT_SETTINGS,
  type EventQuery,
  type Participant,
  type Settings,
  type Store,
  type StoredAttachment,
  type StoredEvent,
  type Usage,
} from "./types.js";

const ALREADY_EXISTS = 6;
const USAGE_TTL_DAYS = 30;

type EventDoc = Omit<StoredEvent, "expireAt"> & { expireAt: Timestamp };

function toEvent(d: EventDoc): StoredEvent {
  return { ...d, expireAt: d.expireAt.toDate().toISOString() };
}

/**
 * 必要な複合インデックス（02_scripts/deploy/deploy.sh で作成）:
 *   events: participantId ASC, occurredAt DESC
 *   events: type ASC, occurredAt DESC
 *   events: participantId ASC, type ASC, occurredAt DESC
 *   events: participantId ASC, receivedAt ASC
 * TTL ポリシー: events.expireAt, usage.expireAt, attachments.expireAt
 */
export class FirestoreStore implements Store {
  constructor(private db: Firestore = new Firestore()) {}

  private settingsRef() {
    return this.db.collection("config").doc("settings");
  }

  async getSettings(): Promise<Settings> {
    const snap = await this.settingsRef().get();
    return { ...DEFAULT_SETTINGS, ...((snap.data() as Partial<Settings>) ?? {}) };
  }

  async updateSettings(patch: Partial<Settings>) {
    await this.settingsRef().set(patch, { merge: true });
    return this.getSettings();
  }

  async nextParticipantId() {
    const ref = this.db.collection("config").doc("counters");
    const n = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = ((snap.data()?.participants as number | undefined) ?? 0) + 1;
      tx.set(ref, { participants: next }, { merge: true });
      return next;
    });
    return `P${String(n).padStart(3, "0")}`;
  }

  async createParticipant(p: Participant) {
    await this.db.collection("participants").doc(p.id).create(p);
  }

  async getParticipant(id: string) {
    const snap = await this.db.collection("participants").doc(id).get();
    return snap.exists ? (snap.data() as Participant) : null;
  }

  private async findOne(field: string, value: string) {
    const q = await this.db.collection("participants").where(field, "==", value).limit(1).get();
    return q.empty ? null : (q.docs[0].data() as Participant);
  }

  findParticipantByTokenHash(hash: string) {
    return this.findOne("tokenHash", hash);
  }

  findParticipantByInviteHash(hash: string) {
    return this.findOne("inviteCodeHash", hash);
  }

  async updateParticipant(id: string, patch: Partial<Participant>) {
    await this.db.collection("participants").doc(id).update(patch);
  }

  async listParticipants() {
    const q = await this.db.collection("participants").orderBy("id").get();
    return q.docs.map((d) => d.data() as Participant);
  }

  async deleteParticipant(id: string) {
    for (const name of ["events", "attachments"]) {
      for (;;) {
        const q = await this.db.collection(name).where("participantId", "==", id).limit(name === "events" ? 400 : 20).get();
        if (q.empty) break;
        const batch = this.db.batch();
        q.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await this.db.collection("participants").doc(id).delete();
  }

  async insertEvents(events: StoredEvent[]) {
    const results = await Promise.all(
      events.map(async (e) => {
        try {
          const doc: EventDoc = { ...e, expireAt: Timestamp.fromDate(new Date(e.expireAt)) };
          await this.db.collection("events").doc(e.eventId).create(doc);
          return 1;
        } catch (err) {
          if ((err as { code?: number }).code === ALREADY_EXISTS) return 0;
          throw err;
        }
      }),
    );
    return results.reduce<number>((a, b) => a + b, 0);
  }

  async insertAttachments(list: StoredAttachment[]) {
    await Promise.all(
      list.map(async (a) => {
        try {
          await this.db.collection("attachments").doc(a.attachmentId).create({ ...a, expireAt: Timestamp.fromDate(new Date(a.expireAt)) });
        } catch (err) {
          if ((err as { code?: number }).code !== ALREADY_EXISTS) throw err;
        }
      }),
    );
  }

  async getAttachment(id: string) {
    const snap = await this.db.collection("attachments").doc(id).get();
    if (!snap.exists) return null;
    const d = snap.data() as Omit<StoredAttachment, "expireAt"> & { expireAt: Timestamp };
    return { ...d, expireAt: d.expireAt.toDate().toISOString() };
  }

  /** 条件に合う直近 limit 件を時系列（古い順）で返す */
  async queryEvents(q: EventQuery) {
    let query: FirebaseFirestore.Query = this.db.collection("events");
    if (q.participantId) query = query.where("participantId", "==", q.participantId);
    if (q.types && q.types.length) query = query.where("type", "in", q.types.slice(0, 30));
    if (q.from) query = query.where("occurredAt", ">=", q.from);
    if (q.to) query = query.where("occurredAt", "<=", q.to);
    query = query.orderBy("occurredAt", "desc");
    if (q.limit) query = query.limit(q.limit);
    const snap = await query.get();
    return snap.docs.map((d) => toEvent(d.data() as EventDoc)).reverse();
  }

  async countEvents(participantId: string, sinceIso: string) {
    const snap = await this.db
      .collection("events")
      .where("participantId", "==", participantId)
      .where("receivedAt", ">=", sinceIso)
      .count()
      .get();
    return snap.data().count;
  }

  async addUsage(key: string, requests: number, tokens: number): Promise<Usage> {
    const ref = this.db.collection("usage").doc(key.replace(/\//g, "_"));
    await ref.set(
      {
        requests: FieldValue.increment(requests),
        tokens: FieldValue.increment(tokens),
        expireAt: Timestamp.fromDate(new Date(Date.now() + USAGE_TTL_DAYS * 86_400_000)),
      },
      { merge: true },
    );
    return this.getUsage(key);
  }

  async getUsage(key: string): Promise<Usage> {
    const snap = await this.db.collection("usage").doc(key.replace(/\//g, "_")).get();
    const d = snap.data() ?? {};
    return { requests: (d.requests as number) ?? 0, tokens: (d.tokens as number) ?? 0 };
  }
}
