export interface Part {
  text?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [k: string]: unknown;
}

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Consent {
  use: boolean;
  metadata: boolean;
  content: boolean;
}

export interface Status {
  participantId: string;
  status: "invited" | "active" | "stopped" | "withdrawn";
  allowed: boolean;
  reason: string | null;
  consent: (Consent & { updatedAt: string }) | null;
  model: string;
  minExtensionVersion: string;
  /** resetsAt は回数が 0 に戻る時刻（ISO 形式）。古いサーバーは返さない */
  usage: { requestsToday: number; tokensToday: number; requestsPerDay: number; tokensPerDay: number; resetsAt?: string };
}

export type ChatChunk =
  | { type: "text"; text: string }
  | { type: "done"; content: Content; usage: { inputTokens: number; outputTokens: number } }
  | { type: "error"; status: number; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string; reason?: string; scope?: string },
  ) {
    super(body.reason ?? body.error ?? `HTTP ${status}`);
  }
}

export class ApiClient {
  constructor(
    private baseUrl: () => string,
    private token: () => Promise<string | undefined>,
    private version: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}, auth = true) {
    const headers: Record<string, string> = { "content-type": "application/json", "x-extension-version": this.version };
    if (auth) {
      const t = await this.token();
      if (!t) throw new ApiError(401, { error: "unauthorized" });
      headers.authorization = `Bearer ${t}`;
    }
    const res = await this.fetchImpl(`${this.baseUrl().replace(/\/$/, "")}/api/v1${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    return res;
  }

  async activate(inviteCode: string): Promise<{ token: string; participantId: string }> {
    const res = await this.request("/activate", { body: { inviteCode, extensionVersion: this.version } }, false);
    return res.json() as Promise<{ token: string; participantId: string }>;
  }

  async status(): Promise<Status> {
    return (await this.request("/status")).json() as Promise<Status>;
  }

  async setConsent(consent: Consent & { requestDeletion?: boolean }): Promise<Status> {
    return (await this.request("/consent", { body: consent })).json() as Promise<Status>;
  }

  async sendEvents(events: unknown[]): Promise<{ inserted: number }> {
    return (await this.request("/events", { body: { events } })).json() as Promise<{ inserted: number }>;
  }

  async *chat(
    body: { contents: Content[]; tools: FunctionDeclaration[]; systemInstruction: string },
    signal?: AbortSignal,
  ): AsyncGenerator<ChatChunk> {
    const res = await this.request("/chat", { body, signal });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) yield JSON.parse(line) as ChatChunk;
      }
    }
    if (buf.trim()) yield JSON.parse(buf) as ChatChunk;
  }
}
