import { Hono } from "hono";
import type { AppConfig } from "../config.js";
import type { LlmClient } from "../llm.js";
import { inviteParticipant, reissueInvite } from "../participants.js";
import type { Participant, Store } from "../store/types.js";
import { dayKey } from "../util.js";
import { endSession, GoogleAuth, requireAdmin, startSession, type AdminEnv } from "./auth.js";
import { registerDataRoutes } from "./dataRoutes.js";
import { fmt, Layout, STATUS_LABEL } from "./layout.js";

const STALE_DAYS = 3;

function ConsentCell({ p }: { p: Participant }) {
  if (!p.consent) return <span>未回答</span>;
  const { use, metadata, content } = p.consent;
  return <span>{[use, metadata, content].map((v) => (v ? "○" : "×")).join(" ")}</span>;
}

export function createAdmin({ store, config, now = () => new Date() }: { store: Store; llm: LlmClient; config: AppConfig; now?: () => Date }) {
  const admin = new Hono<AdminEnv>();
  const google = new GoogleAuth(config);

  admin.get("/login", (c) =>
    c.html(
      <Layout title="ログイン">
        <div class="card">
          <h2>管理者ログイン</h2>
          <p>許可された Google アカウントでのみログインできます。</p>
          {c.req.query("error") && <p class="warn">ログインできませんでした（許可されていないアカウントか、認証に失敗しました）。</p>}
          {google.enabled ? (
            <a class="btn primary" href="/admin/oauth/start">Google でログイン</a>
          ) : (
            <p class="warn">GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です。</p>
          )}
          {config.devLogin && (
            <form method="post" action="/admin/dev-login" style="margin-top:16px">
              <p>ローカル開発用ログイン（ADMIN_DEV_LOGIN=1・本番では無効）</p>
              <input name="email" type="email" placeholder="ADMIN_EMAILS に含まれるアドレス" required />
              <button>ログイン</button>
            </form>
          )}
        </div>
      </Layout>,
    ),
  );

  admin.get("/oauth/start", (c) => (google.enabled ? google.begin(c) : c.redirect("/admin/login?error=1")));

  admin.get("/oauth/callback", async (c) => {
    const email = await google.finish(c).catch(() => null);
    if (!email) return c.redirect("/admin/login?error=1");
    await startSession(c, config, email);
    return c.redirect("/admin");
  });

  admin.post("/dev-login", async (c) => {
    if (!config.devLogin) return c.notFound();
    const email = String((await c.req.parseBody()).email ?? "").trim().toLowerCase();
    if (!config.adminEmails.includes(email)) return c.redirect("/admin/login?error=1");
    await startSession(c, config, email);
    return c.redirect("/admin");
  });

  admin.post("/logout", (c) => {
    endSession(c);
    return c.redirect("/admin/login");
  });

  admin.use("/*", requireAdmin(config));

  const participantsPage = async (email: string, created?: { id: string; code: string }[], notice?: string) => {
    const [settings, list] = await Promise.all([store.getSettings(), store.listParticipants()]);
    const days = Array.from({ length: 7 }, (_, i) => dayKey(new Date(now().getTime() - i * 86_400_000), config.usageTimeZone));
    const day = days[0];
    const since = new Date(now().getTime() - 86_400_000).toISOString();
    const staleBefore = now().getTime() - STALE_DAYS * 86_400_000;
    const rows = await Promise.all(
      list.map(async (p) => {
        const usages = await Promise.all(days.map((d) => store.getUsage(`user_${p.id}_${d}`)));
        const week = usages.reduce((a, u) => ({ requests: a.requests + u.requests, tokens: a.tokens + u.tokens }), { requests: 0, tokens: 0 });
        const stale = p.status === "active" && (!p.lastEventAt || Date.parse(p.lastEventAt) < staleBefore);
        return { p, usage: usages[0], week, stale, events24h: await store.countEvents(p.id, since) };
      }),
    );
    const global = await store.getUsage(`global_${day}`);
    return (
      <Layout title="参加者" email={email}>
        {notice && <div class="card">{notice}</div>}
        <div class="card">
          <h2>全体</h2>
          <p>
            状態：{settings.globalStopped ? <span class="warn">全体停止中</span> : "稼働中"} ／ 本日のリクエスト：{global.requests} / {settings.globalRequestsPerDay} ／ トークン：{global.tokens.toLocaleString()}
          </p>
          <form class="inline" method="post" action={settings.globalStopped ? "/admin/global/resume" : "/admin/global/stop"}>
            <button class={settings.globalStopped ? "primary" : "danger"} onclick={settings.globalStopped ? undefined : "return confirm('全参加者の利用を停止します。よろしいですか？')"}>
              {settings.globalStopped ? "全体の利用を再開" : "全体の利用を停止"}
            </button>
          </form>
        </div>
        {created && created.length > 0 && (
          <div class="card">
            <h2>発行した招待コード</h2>
            <p class="warn">招待コードはこの画面でのみ表示されます。参加者ごとに個別に伝えてください。</p>
            <table>
              <tr><th>研究用ID</th><th>招待コード</th></tr>
              {created.map((x) => (
                <tr><td>{x.id}</td><td class="code">{x.code}</td></tr>
              ))}
            </table>
          </div>
        )}
        <div class="card">
          <h2>参加者</h2>
          <form method="post" action="/admin/participants" style="margin-bottom:12px">
            <input name="count" type="number" min="1" max="50" value="1" style="width:60px" /> 人分の招待コードを
            <button class="primary">発行</button>
          </form>
          <table>
            <tr>
              <th>研究用ID</th><th>状態</th><th>同意(利用/ログ/本文)</th><th>最終接続</th><th>最終ログ受信</th><th>24h件数</th><th>本日の利用</th><th>直近7日</th><th>拡張</th><th>操作</th>
            </tr>
            {rows.map(({ p, usage, week, stale, events24h }) => (
              <tr>
                <td><a href={`/admin/events?participant=${p.id}`}>{p.id}</a></td>
                <td>
                  <span class={`badge ${p.status}`}>{STATUS_LABEL[p.status]}</span>
                  {p.deletionRequested && <div class="warn">削除依頼あり</div>}
                </td>
                <td><ConsentCell p={p} /></td>
                <td>{fmt(p.lastSeenAt)}</td>
                <td class={stale ? "warn" : undefined}>{fmt(p.lastEventAt)}{stale && <div>{STALE_DAYS}日以上受信なし</div>}</td>
                <td>{events24h}</td>
                <td>{usage.requests}回 / {usage.tokens.toLocaleString()}tok</td>
                <td>{week.requests}回 / {week.tokens.toLocaleString()}tok</td>
                <td>{p.extensionVersion ?? "—"}</td>
                <td>
                  {p.status === "stopped" || p.status === "withdrawn" ? (
                    <form class="inline" method="post" action={`/admin/participants/${p.id}/resume`}><button>再開</button></form>
                  ) : (
                    <form class="inline" method="post" action={`/admin/participants/${p.id}/stop`}><button class="danger">停止</button></form>
                  )}{" "}
                  <form class="inline" method="post" action={`/admin/participants/${p.id}/reissue`}>
                    <button onclick="return confirm('招待コードを再発行します。現在の端末の接続は無効になります。')">コード再発行</button>
                  </form>{" "}
                  <form class="inline" method="post" action={`/admin/participants/${p.id}/delete`}>
                    <button class="danger" onclick={`return confirm('${p.id} の参加者情報とすべてのログを削除します。元に戻せません。')`}>削除</button>
                  </form>
                </td>
              </tr>
            ))}
          </table>
        </div>
      </Layout>
    );
  };

  admin.get("/", async (c) => c.html(await participantsPage(c.get("adminEmail"))));

  admin.post("/participants", async (c) => {
    const count = Math.max(1, Math.min(50, Number((await c.req.parseBody()).count) || 1));
    const created: { id: string; code: string }[] = [];
    for (let i = 0; i < count; i++) {
      const { participant, inviteCode } = await inviteParticipant(store, now());
      created.push({ id: participant.id, code: inviteCode });
    }
    return c.html(await participantsPage(c.get("adminEmail"), created));
  });

  admin.post("/participants/:id/:action", async (c) => {
    const id = c.req.param("id");
    const p = await store.getParticipant(id);
    if (!p) return c.notFound();
    switch (c.req.param("action")) {
      case "stop":
        if (p.status !== "withdrawn") await store.updateParticipant(id, { status: "stopped" });
        break;
      case "resume":
        // 撤回者の再開後は、参加者が再度すべてに同意するまで利用できない
        if (p.status === "stopped" || p.status === "withdrawn") await store.updateParticipant(id, { status: p.activatedAt ? "active" : "invited" });
        break;
      case "reissue": {
        const code = await reissueInvite(store, id);
        return c.html(await participantsPage(c.get("adminEmail"), [{ id, code }]));
      }
      case "delete":
        await store.deleteParticipant(id);
        return c.html(await participantsPage(c.get("adminEmail"), undefined, `${id} の参加者情報とログを削除しました。`));
      default:
        return c.notFound();
    }
    return c.redirect("/admin");
  });

  admin.post("/global/:action", async (c) => {
    const action = c.req.param("action");
    if (action !== "stop" && action !== "resume") return c.notFound();
    await store.updateSettings({ globalStopped: action === "stop" });
    return c.redirect("/admin");
  });

  registerDataRoutes(admin, store, config, now);
  return admin;
}
