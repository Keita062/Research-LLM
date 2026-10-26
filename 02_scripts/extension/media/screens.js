/* 招待コード入力・同意・停止中などの画面 */
(function () {
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== false) el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) el.append(c);
    return el;
  };

  const CONSENT_ITEMS = [
    ["use", "① 環境の利用と Gemini への送信", "入力した指示と、エージェントが読んだファイルの内容・コマンドの出力が、研究用サーバーを経由して Google の Gemini API に送られることに同意します。無料枠の API を使うため、送信内容は Google のサービス改善に利用されることがあります。個人情報や秘密情報を含むファイルは扱わないでください。"],
    ["metadata", "② 操作ログ（メタデータ）の提供", "操作の種類・時刻・ツール名・承認／拒否・成否・変更行数・ファイルの拡張子などを研究者に提供することに同意します。ファイルの内容・ファイル名・パス・コマンドの文字列や出力は収集しません。"],
    ["content", "③ 本文の提供", "あなたの入力（指示）・AI の回答・拒否時の修正指示の本文を研究者に提供することに同意します。"],
  ];

  function activateScreen(post, state) {
    const input = h("input", { id: "code", placeholder: "XXXX-XXXX", style: "font-size:16px;width:12em" });
    const submit = () => input.value.trim() && post({ type: "activate", code: input.value.trim() });
    input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
    return h("div", { class: "screen" },
      h("h3", {}, "招待コードを入力してください"),
      h("p", {}, "研究者から受け取った招待コードを入力すると利用を開始できます。"),
      input, " ", h("button", { onclick: submit }, "開始"),
      state.message ? h("p", { class: "err" }, state.message) : null,
    );
  }

  function consentScreen(post, state) {
    const cur = state.consent || {};
    const boxes = {};
    const items = CONSENT_ITEMS.map(([key, title, body]) => {
      boxes[key] = h("input", { type: "checkbox", id: `c-${key}`, checked: !!cur[key] });
      return h("div", { class: "consent-item" }, h("label", {}, boxes[key], " ", h("strong", {}, title)), h("p", { class: "note" }, body));
    });
    const submit = () => post({ type: "consent", use: boxes.use.checked, metadata: boxes.metadata.checked, content: boxes.content.checked });
    return h("div", { class: "screen" },
      h("h3", {}, "研究へのご協力について"),
      h("p", {}, "このエージェントは卒業研究のための実験環境です。①〜③のすべてに同意いただいた場合に利用できます。"),
      ...items,
      h("p", { class: "note" }, "・収集したデータは研究用ID（氏名ではありません）で管理し、受信から1年後に自動で削除します。"),
      h("p", { class: "note" }, "・ログ収集は画面上部の「収集を一時停止」でいつでも止められます（停止中もエージェントは使えます）。"),
      h("p", { class: "note" }, "・同意はいつでも撤回できます。撤回すると利用は停止されます（再開には研究者への連絡が必要です）。撤回時にこれまでのデータの削除を依頼することもできます。"),
      h("div", { class: "row" },
        h("button", { onclick: submit }, state.consent ? "同意内容を保存" : "同意して開始"),
        state.consent ? h("button", { class: "secondary", onclick: () => post({ type: "refresh" }) }, "戻る") : null,
      ),
    );
  }

  function messageScreen(post, title, message, retry) {
    return h("div", { class: "screen" },
      h("h3", {}, title),
      h("p", {}, message || ""),
      retry ? h("button", { onclick: () => post({ type: "refresh" }) }, "再確認") : null,
    );
  }

  window.Screens = { h, activateScreen, consentScreen, messageScreen };
})();
