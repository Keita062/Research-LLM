/* チャット画面と拡張機能本体とのメッセージ処理 */
(function () {
  const vscode = acquireVsCodeApi();
  const post = (m) => vscode.postMessage(m);
  const { h, activateScreen, consentScreen, messageScreen } = window.Screens;
  const app = document.getElementById("app");
  let state = { screen: "offline" };
  let log, input, sendBtn, cancelBtn, current;
  const tools = new Map();

  const TOOL_LABEL = { read_file: "ファイルを読む", list_files: "一覧", search_files: "検索", edit_file: "ファイルを編集", write_file: "ファイルを書き込む", run_command: "コマンド実行" };
  const STATUS_LABEL = { pending: "承認待ち", running: "実行中", done: "完了", error: "失敗", rejected: "拒否" };

  function scroll() {
    if (log) log.scrollTop = log.scrollHeight;
  }

  function setBusy(busy) {
    if (!sendBtn) return;
    const paused = !!state.paused;
    sendBtn.disabled = busy || paused;
    cancelBtn.style.display = busy ? "" : "none";
    input.disabled = paused;
    input.placeholder = paused ? "ログ収集を一時停止中は使えません。上の「収集を再開」を押すと使えます" : "エージェントへの指示（Ctrl+Enter で送信）";
  }

  /** 上部のバー。状態が変わるたびに作り直す（会話欄・入力欄には触らない） */
  function chatBar() {
    const u = state.usage;
    return h("div", { class: "bar" },
      h("span", {}, `ID: ${state.participantId || ""}`),
      u ? h("span", {}, `本日 ${u.requestsToday}/${u.requestsPerDay}回`) : null,
      state.paused ? h("span", { class: "paused" }, "ログ収集を一時停止中（エージェントは使えません）") : null,
      h("span", { class: "sp" }),
      h("button", { class: "secondary", onclick: () => post({ type: "setPaused", paused: !state.paused }) }, state.paused ? "収集を再開" : "収集を一時停止"),
      h("button", { class: "secondary", onclick: () => post({ type: "newConversation" }) }, "新しい会話"),
      h("button", { class: "secondary", onclick: () => post({ type: "showConsent" }) }, "同意"),
    );
  }

  function chatScreen() {
    const bar = chatBar();
    log = h("div", { id: "log" });
    input = h("textarea", { id: "input", rows: "3", placeholder: "エージェントへの指示（Ctrl+Enter で送信）" });
    const send = () => {
      const text = input.value.trim();
      if (!text || sendBtn.disabled) return;
      input.value = "";
      post({ type: "send", text });
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        send();
      }
    });
    sendBtn = h("button", { onclick: send }, "送信");
    cancelBtn = h("button", { class: "secondary", style: "display:none", onclick: () => post({ type: "cancel" }) }, "中止");
    return [bar, log, h("div", { class: "composer" }, input, h("div", { class: "row" }, sendBtn, cancelBtn))];
  }

  function render() {
    app.replaceChildren();
    log = input = sendBtn = cancelBtn = current = undefined;
    tools.clear();
    const s = state.screen;
    if (s === "activate") app.append(activateScreen(post, state));
    else if (s === "consent") app.append(consentScreen(post, state));
    else if (s === "denied") app.append(messageScreen(post, "利用できません", state.message, true));
    else if (s === "noWorkspace") app.append(messageScreen(post, "フォルダを開いてください", "エージェントは VS Code で開いているフォルダ内のファイルを扱います。「ファイル」→「フォルダーを開く」でプロジェクトを開いてください。", true));
    else if (s === "offline") app.append(messageScreen(post, "接続中…", state.message, !!state.message));
    else app.append(...chatScreen());
    setBusy(!!state.busy);
  }

  function addMsg(cls, text) {
    const el = h("div", { class: `msg ${cls}` }, text);
    log.append(el);
    scroll();
    return el;
  }

  function onTool(m) {
    const label = `${TOOL_LABEL[m.name] || m.name}: ${m.summary || ""} — ${STATUS_LABEL[m.status] || m.status}`;
    let el = tools.get(m.id);
    if (!el) {
      el = h("div", { class: "tool" });
      tools.set(m.id, el);
      log.append(el);
    }
    el.className = `tool ${m.status}`;
    el.replaceChildren(label, m.detail ? h("div", { class: "note" }, m.detail) : null);
    current = undefined;
    scroll();
  }

  function onApproval(m) {
    const fb = h("textarea", { rows: "2", placeholder: "修正してほしい内容（任意）", style: "display:none" });
    const box = h("div", { class: "approval" });
    const decide = (decision) => {
      if (decision === "feedback" && fb.style.display === "none") {
        fb.style.display = "";
        fb.focus();
        return;
      }
      if (decision === "feedback" && !fb.value.trim()) return;
      post({ type: "approval", id: m.id, decision, feedback: decision === "feedback" ? fb.value.trim() : undefined });
      box.remove();
    };
    const what = m.kind === "command" ? `コマンドを実行します:\n${m.summary}` : `${m.summary} を${m.created ? "作成" : "変更"}します（+${m.stats.linesAdded} / -${m.stats.linesRemoved} 行）。差分はエディタに表示しています。`;
    box.append(
      h("div", { class: "msg" }, what),
      fb,
      h("div", { class: "row" },
        h("button", { onclick: () => decide("approve") }, "承認"),
        h("button", { class: "secondary", onclick: () => decide("reject") }, "拒否"),
        h("button", { class: "secondary", onclick: () => decide("feedback") }, "修正を指示して拒否"),
      ),
    );
    log.append(box);
    scroll();
  }

  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (m.type === "state") {
      const keepChat = state.screen === "chat" && m.screen === "chat" && log;
      state = m;
      if (keepChat) {
        app.firstChild.replaceWith(chatBar());
        setBusy(!!m.busy);
      } else render();
      return;
    }
    if (!log) return;
    if (m.type === "user") addMsg("user", m.text);
    else if (m.type === "delta") {
      if (!current) current = addMsg("model", "");
      current.dataset.raw = (current.dataset.raw || "") + m.text;
      current.innerHTML = window.renderMd(current.dataset.raw);
      scroll();
    } else if (m.type === "modelEnd") current = undefined;
    else if (m.type === "tool") onTool(m);
    else if (m.type === "approval") onApproval(m);
    else if (m.type === "error") addMsg("err", m.message);
    else if (m.type === "busy") setBusy(m.busy);
    else if (m.type === "cleared") log.replaceChildren();
    else if (m.type === "replay") {
      for (const it of m.items) {
        if (it.type === "user") addMsg("user", it.text);
        else if (it.type === "model") addMsg("model", "").innerHTML = window.renderMd(it.text);
        else if (it.type === "tool") onTool(it);
        else if (it.type === "error") addMsg("err", it.message);
      }
    }
  });

  render();
  post({ type: "ready" });
})();
