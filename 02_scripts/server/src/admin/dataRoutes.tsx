import type { Hono } from "hono";
import type { AppConfig } from "../config.js";
import { EVENT_TYPES } from "../events.js";
import type { EventQuery, Settings, Store } from "../store/types.js";
import type { AdminEnv } from "./auth.js";
import { CSV_COLUMNS, toCsv } from "./csv.js";
import { fmt, Layout } from "./layout.js";

const CSV_MAX_ROWS = 50_000;
const VIEW_MAX_ROWS = 500;

export function eventQuery(q: (k: string) => string | undefined, max: number): EventQuery {
  const types = (q("type") ?? "").split(",").filter((t) => (EVENT_TYPES as readonly string[]).includes(t));
  const from = q("from");
  const to = q("to");
  return {
    participantId: q("participant") || undefined,
    types: types.length ? types : undefined,
    from: from ? new Date(`${from}T00:00:00+09:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999+09:00`).toISOString() : undefined,
    limit: Math.min(Number(q("limit")) || max, max),
  };
}

const NUMERIC = ["globalRequestsPerMinute", "globalRequestsPerDay", "perUserRequestsPerDay", "perUserTokensPerDay"] as const;
const SETTING_LABEL: Record<(typeof NUMERIC)[number], string> = {
  globalRequestsPerMinute: "全体の1分あたりリクエスト上限",
  globalRequestsPerDay: "全体の1日あたりリクエスト上限",
  perUserRequestsPerDay: "1人1日あたりリクエスト上限",
  perUserTokensPerDay: "1人1日あたりトークン上限",
};

export function registerDataRoutes(admin: Hono<AdminEnv>, store: Store, config: AppConfig, now: () => Date) {
  admin.get("/events", async (c) => {
    const q = (k: string) => c.req.query(k);
    const [events, participants] = await Promise.all([store.queryEvents(eventQuery(q, VIEW_MAX_ROWS)), store.listParticipants()]);
    events.reverse();
    const filters = ["participant", "type", "from", "to"].filter((k) => q(k));
    return c.html(
      <Layout title="ログ" email={c.get("adminEmail")}>
        <div class="card">
          <form method="get" action="/admin/events">
            <label>参加者{" "}
              <select name="participant">
                <option value="">すべて</option>
                {participants.map((p) => <option value={p.id} selected={q("participant") === p.id}>{p.id}</option>)}
              </select>
            </label>
            <label>種別{" "}
              <select name="type">
                <option value="">すべて</option>
                {EVENT_TYPES.map((t) => <option value={t} selected={q("type") === t}>{t}</option>)}
              </select>
            </label>
            <label>開始日 <input type="date" name="from" value={q("from") ?? ""} /></label>
            <label>終了日 <input type="date" name="to" value={q("to") ?? ""} /></label>
            <button>絞り込み</button> {filters.length > 0 && <a href="/admin/events">条件をクリア</a>}
          </form>
        </div>
        <div class="card">
          <h2>CSV ダウンロード</h2>
          <p>上の絞り込み条件で出力します（最大 {CSV_MAX_ROWS.toLocaleString()} 件）。出力する列を選んでください。</p>
          <form method="get" action="/admin/events.csv" class="cols">
            {filters.map((k) => <input type="hidden" name={k} value={q(k)} />)}
            {CSV_COLUMNS.map((col) => (
              <label><input type="checkbox" name="cols" value={col.key} checked={col.defaultOn} /> {col.label}</label>
            ))}
            <div style="margin-top:8px"><button class="primary">CSV をダウンロード</button></div>
          </form>
        </div>
        <div class="card">
          <h2>イベント（新しい順・最大 {VIEW_MAX_ROWS} 件）</h2>
          <table>
            <tr><th>発生時刻</th><th>研究用ID</th><th>種別</th><th>会話/ターン</th><th>payload</th><th>本文</th></tr>
            {events.map((e) => (
              <tr>
                <td>{fmt(e.occurredAt)}</td>
                <td>{e.participantId}</td>
                <td>{e.type}</td>
                <td>{e.conversationId ? `${e.conversationId.slice(0, 8)} / ${e.turnIndex ?? ""}` : "—"}</td>
                <td><pre>{JSON.stringify(e.payload)}</pre></td>
                <td>
                  <pre>{e.content ? [e.content.text, e.content.feedback].filter(Boolean).join("\n---\n").slice(0, 500) : ""}</pre>
                  {e.content?.attachments?.split(",").map((id, i) => (
                    <a href={`/admin/attachments/${id}`} target="_blank" rel="noopener">添付画像{i + 1} </a>
                  ))}
                </td>
              </tr>
            ))}
          </table>
        </div>
      </Layout>,
    );
  });

  admin.get("/attachments/:id", async (c) => {
    const a = await store.getAttachment(c.req.param("id"));
    if (!a) return c.notFound();
    c.header("content-type", a.mimeType);
    c.header("cache-control", "private, no-store");
    c.header("x-content-type-options", "nosniff");
    return c.body(Buffer.from(a.data, "base64"));
  });

  admin.get("/events.csv", async (c) => {
    const cols = c.req.queries("cols") ?? CSV_COLUMNS.filter((x) => x.defaultOn).map((x) => x.key);
    const events = await store.queryEvents(eventQuery((k) => c.req.query(k), CSV_MAX_ROWS));
    const stamp = now().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", `attachment; filename="events_${stamp}.csv"`);
    return c.body(toCsv(events, cols));
  });

  admin.get("/settings", async (c) => {
    const s = await store.getSettings();
    return c.html(
      <Layout title="設定" email={c.get("adminEmail")}>
        <div class="card">
          <h2>設定</h2>
          {c.req.query("saved") && <p>保存しました。</p>}
          <form method="post" action="/admin/settings">
            <table>
              <tr><th>モデル</th><td><input name="model" value={s.model} /></td></tr>
              {NUMERIC.map((k) => (
                <tr><th>{SETTING_LABEL[k]}</th><td><input name={k} type="number" min="0" value={String(s[k])} /></td></tr>
              ))}
              <tr><th>最低拡張バージョン</th><td><input name="minExtensionVersion" value={s.minExtensionVersion} /></td></tr>
            </table>
            <p>1日の区切りは {config.usageTimeZone} の 0 時です（Gemini API の日次上限のリセット時刻に合わせています）。</p>
            <button class="primary">保存</button>
          </form>
        </div>
      </Layout>,
    );
  });

  admin.post("/settings", async (c) => {
    const body = await c.req.parseBody();
    const patch: Partial<Settings> = {};
    for (const k of NUMERIC) {
      const n = Number(body[k]);
      if (body[k] !== "" && Number.isFinite(n) && n >= 0) patch[k] = Math.floor(n);
    }
    if (typeof body.model === "string" && /^[\w.-]{1,64}$/.test(body.model)) patch.model = body.model;
    if (typeof body.minExtensionVersion === "string" && /^\d+(\.\d+){0,2}$/.test(body.minExtensionVersion)) {
      patch.minExtensionVersion = body.minExtensionVersion;
    }
    await store.updateSettings(patch);
    return c.redirect("/admin/settings?saved=1");
  });
}
