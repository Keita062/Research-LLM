import type { Child } from "hono/jsx";

const css = `
body{font-family:system-ui,-apple-system,"Segoe UI","Hiragino Sans","Yu Gothic UI",sans-serif;margin:0;background:#f6f7f9;color:#1f2328}
header{background:#24292f;color:#fff;padding:10px 20px;display:flex;gap:20px;align-items:center}
header a{color:#fff;text-decoration:none}header .sp{flex:1}
main{padding:20px;max-width:1200px;margin:auto}
table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #d0d7de;padding:6px 8px;font-size:13px;text-align:left;vertical-align:top}
th{background:#eef1f4}.card{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:16px;margin-bottom:16px}
button,.btn{padding:5px 10px;border:1px solid #8c959f;border-radius:5px;background:#f6f8fa;cursor:pointer;font-size:13px}
.danger{background:#cf222e;color:#fff;border-color:#a40e26}.primary{background:#1f883d;color:#fff;border-color:#1a7f37}
.badge{padding:2px 6px;border-radius:10px;font-size:12px}.active{background:#dafbe1}.stopped{background:#ffebe9}.withdrawn{background:#fff8c5}.invited{background:#ddf4ff}
.warn{color:#cf222e;font-weight:bold}.code{font-family:monospace;font-size:22px;letter-spacing:2px;background:#eef1f4;padding:6px 12px}
form.inline{display:inline}label{margin-right:12px}.cols label{display:inline-block;width:220px}
pre{white-space:pre-wrap;word-break:break-all;margin:0;font-size:12px}
`;

export function Layout(props: { title: string; email?: string; children: Child }) {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>{props.title} | Research-LLM 管理画面</title>
        <style>{css}</style>
      </head>
      <body>
        <header>
          <strong>Research-LLM 管理画面</strong>
          {props.email && (
            <>
              <a href="/admin">参加者</a>
              <a href="/admin/events">ログ</a>
              <a href="/admin/settings">設定</a>
              <span class="sp" />
              <span>{props.email}</span>
              <form class="inline" method="post" action="/admin/logout">
                <button>ログアウト</button>
              </form>
            </>
          )}
        </header>
        <main>{props.children}</main>
      </body>
    </html>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  invited: "招待中",
  active: "有効",
  stopped: "停止",
  withdrawn: "撤回",
};

export function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
