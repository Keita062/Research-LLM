import { describe, expect, it } from "vitest";
import { activated, event, FULL, setup } from "./helpers.js";

const chat = { contents: [{ role: "user", parts: [{ text: "こんにちは" }] }] };

describe("参加者API", () => {
  it("招待コードで有効化でき、招待コードは再利用できない", async () => {
    const ctx = setup();
    const p = await activated(ctx);
    const st = (await (await p.call("/status")).json()) as { status: string; allowed: boolean };
    expect(st).toMatchObject({ status: "active", allowed: true });
    const again = await ctx.app.request("/api/v1/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteCode: p.inviteCode }),
    });
    expect(again.status).toBe(404);
  });

  it("トークンなしは 401", async () => {
    const { app } = setup();
    expect((await app.request("/api/v1/status")).status).toBe(401);
  });

  it("同意がそろうまでチャットできない", async () => {
    const ctx = setup();
    const p = await activated(ctx, null);
    const res = await p.call("/chat", { body: chat });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: "consent_required" });
  });

  it("同意を撤回すると withdrawn になり利用停止、再同意しても戻らない", async () => {
    const ctx = setup();
    const p = await activated(ctx);
    await p.call("/consent", { body: { ...FULL, content: false } });
    expect(await (await p.call("/status")).json()).toMatchObject({ status: "withdrawn", allowed: false, reason: "withdrawn" });
    await p.call("/consent", { body: FULL });
    expect((await p.call("/chat", { body: chat })).status).toBe(403);
    const ev = await ctx.store.queryEvents({ participantId: p.id, types: ["consent_changed"] });
    expect(ev.length).toBe(3);
  });

  it("チャットは NDJSON でストリームされ、利用量が記録される", async () => {
    const ctx = setup();
    const p = await activated(ctx);
    const res = await p.call("/chat", { body: chat });
    expect(res.status).toBe(200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.at(-1).type).toBe("done");
    const st = (await (await p.call("/status")).json()) as { usage: { requestsToday: number; tokensToday: number } };
    expect(st.usage.requestsToday).toBe(1);
    expect(st.usage.tokensToday).toBeGreaterThan(0);
  });

  it("管理者停止・全体停止で利用できない", async () => {
    const ctx = setup();
    const p = await activated(ctx);
    await ctx.store.updateParticipant(p.id, { status: "stopped" });
    expect(await (await p.call("/chat", { body: chat })).json()).toMatchObject({ reason: "stopped" });
    await ctx.store.updateParticipant(p.id, { status: "active" });
    await ctx.store.updateSettings({ globalStopped: true });
    expect(await (await p.call("/chat", { body: chat })).json()).toMatchObject({ reason: "global_stopped" });
  });

  it("1人あたりの1日上限を超えると 429", async () => {
    const ctx = setup();
    await ctx.store.updateSettings({ perUserRequestsPerDay: 1 });
    const p = await activated(ctx);
    expect((await p.call("/chat", { body: chat })).status).toBe(200);
    const res = await p.call("/chat", { body: chat });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ scope: "user_day" });
  });

  it("イベントは重複を除いて保存し、許可外の本文キーやIDは保存しない", async () => {
    const ctx = setup();
    const p = await activated(ctx);
    const e = event("user_prompt", { payload: { chars: 5 }, content: { text: "本文", path: "/secret" } });
    const r1 = await (await p.call("/events", { body: { events: [e, e, event("not_a_type"), { type: "user_prompt" }] } })).json();
    expect(r1).toMatchObject({ received: 4, inserted: 1 });
    const saved = (await ctx.store.queryEvents({ participantId: p.id, types: ["user_prompt"] }))[0];
    expect(saved.content).toEqual({ text: "本文" });
    expect(saved.participantId).toBe(p.id);
    const r2 = await (await p.call("/events", { body: { events: [e] } })).json();
    expect(r2).toMatchObject({ inserted: 0 });
  });

  it("撤回後のイベントは保存しない", async () => {
    const ctx = setup();
    const p = await activated(ctx);
    await p.call("/consent", { body: { use: false, metadata: false, content: false } });
    const r = await (await p.call("/events", { body: { events: [event("user_prompt")] } })).json();
    expect(r).toMatchObject({ inserted: 0 });
  });
});
