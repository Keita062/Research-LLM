/* チャット画面と拡張機能本体とのメッセージ処理 */
(function () {
  const vscode = acquireVsCodeApi();
  const post = (m) => vscode.postMessage(m);
  const { h, activateScreen, consentScreen, messageScreen } = window.Screens;
  const app = document.getElementById("app");
  let state = { screen: "offline" };
  let log, input, sendBtn, cancelBtn, attachBtn, attachRow, current;
  /** 送信前の添付画像 { mimeType, data(base64), url } */
  let pending = [];
  const tools = new Map();
  const MAX_IMAGES = 4;
  const MAX_SIDE = 1568;
  const MAX_BASE64 = 900_000;

  const TOOL_LABEL = { read_file: "ファイルを読む", list_files: "一覧", search_files: "検索", edit_file: "ファイルを編集", write_file: "ファイルを書き込む", run_command: "コマンド実行" };
  const STATUS_LABEL = { pending: "承認待ち", running: "実行中", done: "完了", error: "失敗", rejected: "拒否" };

  function scroll() {
    if (log) log.scrollTop = log.scrollHeight;
  }

  function setBusy(busy) {
    if (!sendBtn) return;
    const paused = !!state.paused;
    sendBtn.disabled = busy || paused;
    attachBtn.disabled = paused;
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

  /** 画像を縮小して JPEG にする（送信量と保存容量を抑えるため） */
  async function toJpeg(blob) {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    for (const [shrink, quality] of [[1, 0.85], [1, 0.7], [0.7, 0.7], [0.5, 0.6]]) {
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height)) * shrink;
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", quality);
      const data = url.slice(url.indexOf(",") + 1);
      if (data.length <= MAX_BASE64) return { mimeType: "image/jpeg", data, url };
    }
    return null;
  }

  function attachNote(text) {
    attachRow.append(h("span", { class: "note err" }, text));
  }

  function renderAttachments() {
    if (!attachRow) return;
    attachRow.replaceChildren(
      ...pending.map((img, i) =>
        h("span", { class: "pending" },
          h("img", { src: img.url, class: "thumb", alt: `添付画像${i + 1}` }),
          h("button", { class: "secondary remove", title: "外す", onclick: () => { pending.splice(i, 1); renderAttachments(); } }, "×"),
        ),
      ),
    );
    attachRow.style.display = pending.length ? "" : "none";
  }

  /** 縮小処理が終わるまで送信を待たせるため、追加処理を順につなぐ */
  let preparing = Promise.resolve();
  function addFiles(files) {
    const list = [...files];
    preparing = preparing.then(() => prepareFiles(list)).catch(() => undefined);
    return preparing;
  }

  async function prepareFiles(files) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const notes = [];
    for (const f of images) {
      if (pending.length >= MAX_IMAGES) {
        notes.push(`画像は1回に${MAX_IMAGES}枚までです。`);
        break;
      }
      try {
        const img = await toJpeg(f);
        if (img) pending.push(img);
        else notes.push("画像が大きすぎるため添付できませんでした。");
      } catch {
        notes.push("この画像は読み込めませんでした。");
      }
    }
    renderAttachments();
    if (notes.length) {
      attachRow.style.display = "";
      notes.forEach(attachNote);
    }
  }

  function chatScreen() {
    const bar = chatBar();
    log = h("div", { id: "log" });
    input = h("textarea", { id: "input", rows: "3", placeholder: "エージェントへの指示（Ctrl+Enter で送信）" });
    const send = async () => {
      if (sendBtn.disabled) return;
      await preparing;
      const text = input.value.trim();
      if ((!text && pending.length === 0) || sendBtn.disabled) return;
      input.value = "";
      post({ type: "send", text, images: pending.map(({ mimeType, data }) => ({ mimeType, data })) });
      pending = [];
      renderAttachments();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        send();
      }
    });
    // 画像の貼り付け（スクリーンショットなど）
    input.addEventListener("paste", (e) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files);
    });
    const fileInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, style: "display:none" });
    fileInput.addEventListener("change", () => {
      void addFiles(fileInput.files ?? []);
      fileInput.value = "";
    });
    attachRow = h("div", { class: "attachments", style: "display:none" });
    sendBtn = h("button", { onclick: send }, "送信");
    attachBtn = h("button", { class: "secondary", onclick: () => fileInput.click() }, "画像を添付");
    cancelBtn = h("button", { class: "secondary", style: "display:none", onclick: () => post({ type: "cancel" }) }, "中止");
    const composer = h("div", { class: "composer" }, attachRow, input, fileInput, h("div", { class: "row" }, sendBtn, attachBtn, cancelBtn));
    composer.addEventListener("dragover", (e) => e.preventDefault());
    composer.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!input.disabled) void addFiles(e.dataTransfer?.files ?? []);
    });
    renderAttachments();
    return [bar, log, composer];
  }

  function render() {
    app.replaceChildren();
    log = input = sendBtn = cancelBtn = attachBtn = attachRow = current = undefined;
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

  function addUser(text, images) {
    const el = addMsg("user", text);
    if (images && images.length) el.append(h("div", { class: "thumbs" }, ...images.map((src, i) => h("img", { src, class: "thumb", alt: `添付画像${i + 1}` }))));
    scroll();
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
    if (m.type === "user") addUser(m.text, m.images);
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
        if (it.type === "user") addUser(it.text, it.images);
        else if (it.type === "model") addMsg("model", "").innerHTML = window.renderMd(it.text);
        else if (it.type === "tool") onTool(it);
        else if (it.type === "error") addMsg("err", it.message);
      }
    }
  });

  render();
  post({ type: "ready" });
})();
