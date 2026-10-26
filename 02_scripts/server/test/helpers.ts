import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MockLlmClient } from "../src/mockLlm.js";
import { inviteParticipant } from "../src/participants.js";
import { MemoryStore } from "../src/store/memoryStore.js";

export const ADMIN = "admin@example.com";

export function setup() {
  const store = new MemoryStore();
  const config = loadConfig({ ADMIN_EMAILS: ADMIN, ADMIN_DEV_LOGIN: "1", STORE: "memory" } as NodeJS.ProcessEnv);
  const app = createApp({ store, llm: new MockLlmClient(), config });
  return { store, config, app };
}

export const FULL = { use: true, metadata: true, content: true };

export async function activated(ctx: ReturnType<typeof setup>, consent: Record<string, boolean> | null = FULL) {
  const { inviteCode, participant } = await inviteParticipant(ctx.store, new Date());
  const res = await ctx.app.request("/api/v1/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteCode: inviteCode.toLowerCase().replace("-", ""), extensionVersion: "0.1.0" }),
  });
  const { token } = (await res.json()) as { token: string };
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    ctx.app.request(`/api/v1${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  if (consent) await call("/consent", { body: consent });
  return { id: participant.id, token, call, inviteCode };
}

export function event(type: string, extra: Record<string, unknown> = {}) {
  return {
    eventId: crypto.randomUUID(),
    sessionId: "s1",
    conversationId: "c1",
    turnIndex: 0,
    type,
    occurredAt: new Date().toISOString(),
    ...extra,
  };
}

export async function adminCookie(app: ReturnType<typeof setup>["app"]) {
  const res = await app.request("/admin/dev-login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=${encodeURIComponent(ADMIN)}`,
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
