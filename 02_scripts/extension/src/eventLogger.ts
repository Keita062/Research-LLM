import { randomUUID } from "node:crypto";

export interface LoggerStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface EventInput {
  type: string;
  conversationId?: string | null;
  turnIndex?: number | null;
  payload?: Record<string, unknown>;
  content?: { text?: string; feedback?: string };
}

const BUFFER_KEY = "researchLlm.eventBuffer";
const PAUSED_KEY = "researchLlm.collectionPaused";
const MAX_BUFFER = 10_000;
const BATCH = 200;

/** イベントを端末内に貯めて定期送信する。送信失敗時は保持して再送（eventId でサーバー側が重複排除） */
export class EventLogger {
  readonly sessionId = randomUUID();
  private flushing = false;
  private dropped = 0;

  constructor(
    private storage: LoggerStorage,
    private send: (events: unknown[]) => Promise<unknown>,
    private env: { extensionVersion: string; vscodeVersion: string; os: string },
  ) {}

  get paused(): boolean {
    return this.storage.get<boolean>(PAUSED_KEY) === true;
  }

  get pending(): number {
    return this.buffer().length;
  }

  private buffer(): unknown[] {
    return this.storage.get<unknown[]>(BUFFER_KEY) ?? [];
  }

  async setPaused(paused: boolean): Promise<void> {
    if (paused === this.paused) return;
    if (paused) await this.log({ type: "collection_paused" }, true);
    await this.storage.update(PAUSED_KEY, paused);
    if (!paused) await this.log({ type: "collection_resumed" });
  }

  async log(e: EventInput, force = false): Promise<void> {
    if (this.paused && !force) return;
    const buf = this.buffer();
    buf.push({
      eventId: randomUUID(),
      sessionId: this.sessionId,
      conversationId: e.conversationId ?? null,
      turnIndex: e.turnIndex ?? null,
      type: e.type,
      occurredAt: new Date().toISOString(),
      ...this.env,
      payload: e.payload ?? {},
      content: e.content,
    });
    if (buf.length > MAX_BUFFER) {
      this.dropped += buf.length - MAX_BUFFER;
      buf.splice(0, buf.length - MAX_BUFFER);
    }
    await this.storage.update(BUFFER_KEY, buf);
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      if (this.dropped > 0) {
        const n = this.dropped;
        this.dropped = 0;
        await this.log({ type: "buffer_dropped", payload: { count: n } }, true);
      }
      for (;;) {
        const buf = this.buffer();
        if (buf.length === 0) break;
        const batch = buf.slice(0, BATCH);
        await this.send(batch);
        const ids = new Set(batch.map((x) => (x as { eventId: string }).eventId));
        await this.storage.update(BUFFER_KEY, this.buffer().filter((x) => !ids.has((x as { eventId: string }).eventId)));
      }
    } finally {
      this.flushing = false;
    }
  }

  /** 撤回時など：未送信分を破棄する */
  async clear(): Promise<void> {
    await this.storage.update(BUFFER_KEY, []);
  }
}
