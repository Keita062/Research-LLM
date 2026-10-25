import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";
import type { Content, FunctionDeclaration } from "@google/genai";
import { evaluateAccess, MinuteWindow, statusAfterConsent } from "./access.js";
import type { AppConfig } from "./config.js";
import { sanitizeEvents } from "./events.js";
import { LlmError, type LlmClient } from "./llm.js";
import type { Consent, Participant, Store } from "./store/types.js";
import { dayKey, newToken, normalizeInviteCode, sha256 } from "./util.js";

type Env = { Variables: { participant: Participant } };

export interface ApiDeps {
  store: Store;
  llm: LlmClient;
  config: AppConfig;
  now?: () => Date;
}

const SEEN_UPDATE_MS = 60_000;

export function createApi({ store, llm, config, now = () => new Date() }: ApiDeps) {
  const api = new Hono<Env>();
  const minute = new MinuteWindow();

  const usageKeys = (pid: string) => {
    const day = dayKey(now(), config.usageTimeZone);
    return { global: `global_${day}`, user: `user_${pid}_${day}` };
  };

  api.post("/activate", async (c) => {
    const body = await c.req.json<{ inviteCode?: string; extensionVersion?: string }>().catch(() => ({}) as never);
    if (!body?.inviteCode) return c.json({ error: "invite_code_required" }, 400);
    const p = await store.findParticipantByInviteHash(sha256(normalizeInviteCode(body.inviteCode)));
    if (!p) return c.json({ error: "invalid_invite_code" }, 404);
    const token = newToken();
    await store.updateParticipant(p.id, {
      tokenHash: sha256(token),
      inviteCodeHash: null,
      status: p.status === "invited" ? "active" : p.status,
      activatedAt: now().toISOString(),
      lastSeenAt: now().toISOString(),
      extensionVersion: body.extensionVersion?.slice(0, 20) ?? null,
    });
    return c.json({ token, participantId: p.id });
  });

  api.use("/*", async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const p = token ? await store.findParticipantByTokenHash(sha256(token)) : null;
    if (!p) return c.json({ error: "unauthorized" }, 401);
    const t = now();
    const version = c.req.header("x-extension-version")?.slice(0, 20) ?? p.extensionVersion;
    if (!p.lastSeenAt || t.getTime() - Date.parse(p.lastSeenAt) > SEEN_UPDATE_MS || version !== p.extensionVersion) {
      await store.updateParticipant(p.id, { lastSeenAt: t.toISOString(), extensionVersion: version });
    }
    c.set("participant", p);
    await next();
  });

  const statusBody = async (p: Participant) => {
    const settings = await store.getSettings();
    const access = evaluateAccess(p, settings);
    const usage = await store.getUsage(usageKeys(p.id).user);
    return {
      participantId: p.id,
      status: p.status,
      allowed: access.allowed,
      reason: access.allowed ? null : access.reason,
      consent: p.consent,
      requireFullConsent: settings.requireFullConsent,
      model: settings.model,
      minExtensionVersion: settings.minExtensionVersion,
      usage: {
        requestsToday: usage.requests,
        tokensToday: usage.tokens,
        requestsPerDay: settings.perUserRequestsPerDay,
        tokensPerDay: settings.perUserTokensPerDay,
      },
    };
  };

  api.get("/status", async (c) => c.json(await statusBody(c.get("participant"))));

  api.post("/consent", async (c) => {
    const p = c.get("participant");
    const body = await c.req.json<Partial<Consent> & { requestDeletion?: boolean }>().catch(() => ({}) as never);
    const settings = await store.getSettings();
    const consent: Consent = {
      use: body.use === true,
      metadata: body.metadata === true,
      content: body.content === true,
      updatedAt: now().toISOString(),
    };
    const status = statusAfterConsent(p, consent, settings);
    const patch: Partial<Participant> = { consent, status };
    if (body.requestDeletion === true) patch.deletionRequested = true;
    await store.updateParticipant(p.id, patch);
    await store.insertEvents([
      {
        eventId: crypto.randomUUID(),
        participantId: p.id,
        sessionId: "server",
        conversationId: null,
        turnIndex: null,
        type: "consent_changed",
        occurredAt: consent.updatedAt,
        receivedAt: consent.updatedAt,
        expireAt: new Date(now().getTime() + 365 * 86_400_000).toISOString(),
        extensionVersion: p.extensionVersion,
        vscodeVersion: null,
        os: null,
        payload: { use: consent.use, metadata: consent.metadata, content: consent.content, status },
        content: null,
      },
    ]);
    return c.json(await statusBody({ ...p, ...patch }));
  });

  api.post("/events", async (c) => {
    const p = c.get("participant");
    const body = await c.req.json<{ events?: unknown[] }>().catch(() => ({}) as never);
    const list = Array.isArray(body?.events) ? body.events.slice(0, 500) : [];
    const events = sanitizeEvents(list, p, now());
    const inserted = events.length ? await store.insertEvents(events) : 0;
    if (inserted > 0) await store.updateParticipant(p.id, { lastEventAt: now().toISOString() });
    return c.json({ received: list.length, accepted: events.length, inserted });
  });

  api.post("/chat", async (c: Context<Env>) => {
    const p = c.get("participant");
    const settings = await store.getSettings();
    const access = evaluateAccess(p, settings);
    if (!access.allowed) return c.json({ error: "forbidden", reason: access.reason }, 403);

    const body = await c.req
      .json<{ contents?: Content[]; tools?: FunctionDeclaration[]; systemInstruction?: string }>()
      .catch(() => ({}) as never);
    if (!Array.isArray(body?.contents) || body.contents.length === 0) return c.json({ error: "contents_required" }, 400);

    const keys = usageKeys(p.id);
    const [g, u] = await Promise.all([store.getUsage(keys.global), store.getUsage(keys.user)]);
    if (g.requests >= settings.globalRequestsPerDay) return c.json({ error: "rate_limited", scope: "global_day" }, 429);
    if (u.requests >= settings.perUserRequestsPerDay) return c.json({ error: "rate_limited", scope: "user_day" }, 429);
    if (u.tokens >= settings.perUserTokensPerDay) return c.json({ error: "rate_limited", scope: "user_tokens" }, 429);
    if (!minute.tryAcquire(settings.globalRequestsPerMinute)) return c.json({ error: "rate_limited", scope: "global_minute" }, 429);

    await Promise.all([store.addUsage(keys.global, 1, 0), store.addUsage(keys.user, 1, 0)]);

    const iterator = llm.stream({
      model: settings.model,
      contents: body.contents,
      tools: body.tools,
      systemInstruction: body.systemInstruction,
      signal: c.req.raw.signal,
    });
    let first: IteratorResult<Awaited<ReturnType<typeof iterator.next>>["value"]>;
    try {
      first = await iterator.next();
    } catch (err) {
      const status = err instanceof LlmError ? err.status : 502;
      const scope = status === 429 ? "upstream" : undefined;
      return c.json({ error: status === 429 ? "rate_limited" : "upstream_error", scope }, status === 429 ? 429 : 502);
    }

    c.header("content-type", "application/x-ndjson; charset=utf-8");
    return stream(c, async (s) => {
      let result = first;
      try {
        while (!result.done) {
          const chunk = result.value;
          if (chunk.type === "done") {
            const tokens = chunk.usage.inputTokens + chunk.usage.outputTokens;
            await Promise.all([store.addUsage(keys.global, 0, tokens), store.addUsage(keys.user, 0, tokens)]);
          }
          await s.write(JSON.stringify(chunk) + "\n");
          result = await iterator.next();
        }
      } catch (err) {
        const status = err instanceof LlmError ? err.status : 502;
        await s.write(JSON.stringify({ type: "error", status, message: "upstream_error" }) + "\n");
      }
    });
  });

  return api;
}
