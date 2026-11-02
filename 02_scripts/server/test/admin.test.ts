import { describe, expect, it } from "vitest";
import { isAllowedAdmin } from "../src/admin/auth.js";
import { toCsv } from "../src/admin/csv.js";
import { loadConfig } from "../src/config.js";
import { activated, adminCookie, event, setup } from "./helpers.js";

describe("管理画面", () => {
  it("未ログインはログイン画面へリダイレクト", async () => {
    const { app } = setup();
    const res = await app.request("/admin");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/login");
  });

  it("許可リスト外のメールではログインできない", async () => {
    const { app } = setup();
    const res = await app.request("/admin/dev-login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=other%40example.com",
    });
    expect(res.headers.get("location")).toBe("/admin/login?error=1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("Google の検証済みメールかつ許可リスト内のみ許可", () => {
    expect(isAllowedAdmin("Admin@Example.com", true, ["admin@example.com"])).toBe(true);
    expect(isAllowedAdmin("admin@example.com", false, ["admin@example.com"])).toBe(false);
    expect(isAllowedAdmin("x@example.com", true, ["admin@example.com"])).toBe(false);
  });

  it("本番では開発用ログインが無効", () => {
    const c = loadConfig({ NODE_ENV: "production", ADMIN_DEV_LOGIN: "1", SESSION_SECRET: "x".repeat(32) } as NodeJS.ProcessEnv);
    expect(c.devLogin).toBe(false);
  });

  it("招待コード発行・停止・再開・削除ができる", async () => {
    const ctx = setup();
    const cookie = await adminCookie(ctx.app);
    const form = (path: string, body = "") =>
      ctx.app.request(path, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body });
    const html = await (await form("/admin/participants", "count=2")).text();
    expect(html.match(/class="code">[A-Z0-9]{4}-[A-Z0-9]{4}</g)?.length).toBe(2);
    const p = await activated(ctx);
    await form(`/admin/participants/${p.id}/stop`);
    expect((await ctx.store.getParticipant(p.id))?.status).toBe("stopped");
    await form(`/admin/participants/${p.id}/resume`);
    expect((await ctx.store.getParticipant(p.id))?.status).toBe("active");
    await form(`/admin/participants/${p.id}/delete`);
    expect(await ctx.store.getParticipant(p.id)).toBeNull();
  });

  it("添付画像はログインした管理者だけが開ける", async () => {
    const ctx = setup();
    const cookie = await adminCookie(ctx.app);
    const p = await activated(ctx);
    const data = Buffer.from("fake-image").toString("base64");
    const e = event("user_prompt", { content: { text: "見て", images: [{ mimeType: "image/png", data }] } });
    await p.call("/events", { body: { events: [e] } });
    const page = await (await ctx.app.request("/admin/events", { headers: { cookie } })).text();
    expect(page).toContain(`/admin/attachments/${e.eventId}-0`);
    const res = await ctx.app.request(`/admin/attachments/${e.eventId}-0`, { headers: { cookie } });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("fake-image");
    expect((await ctx.app.request(`/admin/attachments/${e.eventId}-0`)).status).toBe(302);
  });

  it("CSV は選択した列だけを出力する", async () => {
    const ctx = setup();
    const cookie = await adminCookie(ctx.app);
    const p = await activated(ctx);
    await p.call("/events", { body: { events: [event("tool_result", { payload: { fileExtension: ".cs", success: true } })] } });
    const res = await ctx.app.request("/admin/events.csv?type=tool_result&cols=participant_id&cols=file_extension", { headers: { cookie } });
    const text = await res.text();
    expect(text.replace("\uFEFF", "").split("\r\n")[0]).toBe("participant_id,file_extension");
    expect(text).toContain(`${p.id},.cs`);
  });

  it("CSV のエスケープ", () => {
    const csv = toCsv([{ eventId: 'a,"b"', payload: {} } as never], ["event_id"]);
    expect(csv).toContain('"a,""b"""');
  });
});
