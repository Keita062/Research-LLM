import * as os from "node:os";
import * as vscode from "vscode";
import { Agent, type AgentSnapshot, type Decision } from "./agent";
import { ApiClient, ApiError, type Status } from "./apiClient";
import { lineDiffCounts } from "./diff";
import { ChatViewProvider, type FromWebview, type Screen } from "./chatView";
import { toolConfig } from "./denylist";
import { EventLogger } from "./eventLogger";
import { DENY_MESSAGES, describeError, toolSummary } from "./messages";
import { compareVersions } from "./version";

const TOKEN_KEY = "researchLlm.token";
const DIFF_SCHEME = "research-llm-diff";
const TRANSCRIPT_KEY = "researchLlm.transcript";
const AGENT_KEY = "researchLlm.agent";
const FLUSH_MS = 30_000;
const STATUS_MS = 5 * 60_000;

export function activate(context: vscode.ExtensionContext): void {
  const version = String(context.extension.packageJSON.version);
  const serverUrl = () => vscode.workspace.getConfiguration("researchLlm").get<string>("serverUrl") ?? "";
  const api = new ApiClient(serverUrl, async () => context.secrets.get(TOKEN_KEY), version);
  const logger = new EventLogger(context.globalState, (ev) => api.sendEvents(ev), {
    extensionVersion: version,
    vscodeVersion: vscode.version,
    os: os.platform(),
  });
  const root = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  let status: Status | undefined;
  const cfg = () => vscode.workspace.getConfiguration("researchLlm");
  const applyConfig = () => {
    toolConfig.denied = cfg().get<string[]>("deniedFiles") ?? toolConfig.denied;
  };
  applyConfig();
  const agent = new Agent(api, logger, root, () => status?.model ?? "", () => cfg().get<boolean>("autoApproveEdits") === true);
  const savedAgent = context.workspaceState.get<AgentSnapshot>(AGENT_KEY);
  if (savedAgent) agent.restore(savedAgent);
  let transcript: Record<string, unknown>[] = context.workspaceState.get(TRANSCRIPT_KEY) ?? [];
  const approvals = new Map<string, (d: Decision) => void>();
  const diffDocs = new Map<string, string>();
  let lastScreen: Screen = "offline";
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "researchLlm.togglePause";
  statusBar.tooltip = "Research LLM：クリックでログ収集を一時停止／再開";
  context.subscriptions.push(statusBar);

  function updateStatusBar(): void {
    const stopped = lastScreen === "denied";
    const label = stopped ? "利用停止中" : logger.paused ? "収集一時停止中" : "収集中";
    const icon = stopped ? "circle-slash" : logger.paused ? "debug-pause" : "record";
    statusBar.text = `$(${icon}) 研究: ${label}${logger.pending ? `（未送信 ${logger.pending}）` : ""}`;
    statusBar.show();
  }

  /** 会話の表示内容を端末内に保存し、パネルを開き直したときに再表示する */
  function record(m: Record<string, unknown>): void {
    const last = transcript.at(-1);
    if (m.type === "delta") {
      if (last?.type === "model") last.text = String(last.text) + String(m.text);
      else transcript.push({ type: "model", text: m.text });
    } else if (m.type === "tool") {
      const i = transcript.findIndex((x) => x.type === "tool" && x.id === m.id);
      if (i >= 0) transcript[i] = m;
      else transcript.push(m);
    } else transcript.push(m);
    if (transcript.length > 300) transcript = transcript.slice(-300);
  }
  const emit = (m: Record<string, unknown>) => {
    record(m);
    view.post(m);
  };
  const saveConversation = () => {
    void context.workspaceState.update(TRANSCRIPT_KEY, transcript);
    void context.workspaceState.update(AGENT_KEY, agent.snapshot());
  };

  const view = new ChatViewProvider(context.extensionUri, (m) => void onMessage(m));
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("researchLlm.chat", view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, { provideTextDocumentContent: (uri) => diffDocs.get(uri.query) ?? "" }),
  );

  const postState = (screen: Screen, extra: Record<string, unknown> = {}) => {
    lastScreen = screen;
    updateStatusBar();
    view.post({ type: "state", screen, participantId: status?.participantId, consent: status?.consent, usage: status?.usage, paused: logger.paused, busy: agent.busy, ...extra });
  };

  async function refresh(): Promise<void> {
    if (!(await context.secrets.get(TOKEN_KEY))) return postState("activate");
    try {
      status = await api.status();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await context.secrets.delete(TOKEN_KEY);
        return postState("activate", { message: "認証が無効になりました。招待コードを入力し直してください。" });
      }
      return postState("offline", { message: describeError(e) });
    }
    if (compareVersions(version, status.minExtensionVersion) < 0) return postState("denied", { message: DENY_MESSAGES.outdated });
    if (!status.allowed) {
      agent.cancel("server_stop");
      if (status.reason === "consent_required") return postState("consent");
      return postState("denied", { message: DENY_MESSAGES[status.reason ?? ""] ?? "現在は利用できません。" });
    }
    if (!root()) return postState("noWorkspace");
    postState("chat");
  }

  async function onConsent(m: Extract<FromWebview, { type: "consent" }>): Promise<void> {
    const full = m.use && m.metadata && m.content;
    let requestDeletion = false;
    if (!full && status?.consent) {
      const pick = await vscode.window.showWarningMessage(
        "同意を撤回すると、このエージェントは利用できなくなります（再開には研究者への連絡が必要です）。撤回しますか？",
        { modal: true },
        "撤回する",
        "撤回し、これまでのデータの削除も依頼する",
      );
      if (!pick) return postState("consent");
      requestDeletion = pick !== "撤回する";
    } else if (!full) {
      void vscode.window.showInformationMessage("①〜③のすべてに同意いただいた場合に利用できます。");
      return;
    }
    try {
      if (full) await logger.flush().catch(() => undefined);
      status = await api.setConsent({ use: m.use, metadata: m.metadata, content: m.content, requestDeletion });
      if (!full) await logger.clear();
    } catch (e) {
      void vscode.window.showErrorMessage(describeError(e));
    }
    await refresh();
  }

  async function onSend(text: string): Promise<void> {
    await refresh();
    if (lastScreen !== "chat" || agent.busy) return;
    emit({ type: "user", text });
    view.post({ type: "busy", busy: true });
    try {
      await agent.send(text, {
        delta: (t) => emit({ type: "delta", text: t }),
        modelEnd: () => view.post({ type: "modelEnd" }),
        tool: (id, name, args, st, detail) => emit({ type: "tool", id, name, summary: toolSummary(name, args), status: st, detail }),
        confirmContinue: async (n) =>
          (await vscode.window.showWarningMessage(`ツールの呼び出しが ${n} 回続きました。続けますか？`, { modal: true }, "続ける")) === "続ける",
        requestApproval: async (req) => {
          if (req.edit) {
            diffDocs.set(`${req.id}-before`, req.edit.before);
            diffDocs.set(`${req.id}-after`, req.edit.after);
            const u = (k: string) => vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${toolSummary(req.name, req.args)}`, query: `${req.id}-${k}` });
            void vscode.commands.executeCommand("vscode.diff", u("before"), u("after"), `提案された変更: ${toolSummary(req.name, req.args)}`, { preview: true });
          }
          view.post({
            type: "approval",
            id: req.id,
            kind: req.edit ? "edit" : "command",
            summary: toolSummary(req.name, req.args),
            created: req.edit ? !req.edit.existed : false,
            stats: req.edit ? lineDiffCounts(req.edit.before, req.edit.after) : undefined,
          });
          const d = await new Promise<Decision>((resolve) => approvals.set(req.id, resolve));
          diffDocs.delete(`${req.id}-before`);
          diffDocs.delete(`${req.id}-after`);
          return d;
        },
      });
    } catch (e) {
      emit({ type: "error", message: describeError(e) });
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) await refresh();
    } finally {
      view.post({ type: "busy", busy: false });
      saveConversation();
      void logger.flush().catch(() => undefined);
      void refresh();
    }
  }

  async function onMessage(m: FromWebview): Promise<void> {
    switch (m.type) {
      case "ready":
        view.flushQueue();
        await refresh();
        if (lastScreen === "chat" && transcript.length) view.post({ type: "replay", items: transcript });
        return;
      case "refresh":
        return refresh();
      case "activate":
        try {
          const r = await api.activate(m.code);
          await context.secrets.store(TOKEN_KEY, r.token);
          await logger.log({ type: "session_start", payload: { reason: "activated", hasWorkspace: !!root() } });
        } catch (e) {
          return postState("activate", { message: e instanceof ApiError && e.status === 404 ? "招待コードが正しくありません。" : describeError(e) });
        }
        return refresh();
      case "consent":
        return onConsent(m);
      case "showConsent":
        return postState("consent");
      case "send":
        return onSend(m.text);
      case "cancel":
        agent.cancel();
        rejectPending();
        return;
      case "approval": {
        const resolve = approvals.get(m.id);
        approvals.delete(m.id);
        resolve?.(m.decision === "feedback" ? { decision: "feedback", feedback: m.feedback ?? "" } : { decision: m.decision });
        return;
      }
      case "newConversation":
        agent.reset();
        rejectPending();
        view.post({ type: "cleared" });
        transcript = [];
        saveConversation();
        return;
      case "setPaused":
        await logger.setPaused(m.paused);
        updateStatusBar();
        return refresh();
    }
  }

  function rejectPending(): void {
    approvals.forEach((resolve) => resolve({ decision: "reject" }));
    approvals.clear();
  }

  const reg = (id: string, fn: () => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  const showScreen = (screen: Screen) => () => {
    view.reveal();
    postState(screen);
  };
  reg("researchLlm.activate", showScreen("activate"));
  reg("researchLlm.consent", showScreen("consent"));
  reg("researchLlm.pauseCollection", () => onMessage({ type: "setPaused", paused: true }));
  reg("researchLlm.resumeCollection", () => onMessage({ type: "setPaused", paused: false }));
  reg("researchLlm.togglePause", () => onMessage({ type: "setPaused", paused: !logger.paused }));
  reg("researchLlm.newConversation", () => onMessage({ type: "newConversation" }));
  reg("researchLlm.status", async () => {
    await refresh();
    const s = status;
    void vscode.window.showInformationMessage(
      s ? `研究用ID ${s.participantId} / 状態 ${s.status} / ログ収集 ${logger.paused ? "一時停止中" : "有効"} / 未送信 ${logger.pending}件` : "未接続です",
    );
  });

  void (async () => {
    if (await context.secrets.get(TOKEN_KEY)) await logger.log({ type: "session_start", payload: { hasWorkspace: !!root() } });
  })();
  // 送信に失敗したら間隔を倍にして再送する（最大30分）
  let flushDelay = FLUSH_MS;
  let flushTimer: ReturnType<typeof setTimeout>;
  const scheduleFlush = () => {
    flushTimer = setTimeout(async () => {
      try {
        await logger.flush();
        flushDelay = FLUSH_MS;
      } catch {
        flushDelay = Math.min(flushDelay * 2, 30 * 60_000);
      }
      updateStatusBar();
      scheduleFlush();
    }, flushDelay);
  };
  scheduleFlush();
  const timer = setInterval(() => void refresh(), STATUS_MS);
  context.subscriptions.push(
    { dispose: () => (clearInterval(timer), clearTimeout(flushTimer)) },
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("researchLlm")) return;
      applyConfig();
      void refresh();
    }),
  );
  extensionLogger = logger;
}

let extensionLogger: EventLogger | undefined;

export async function deactivate(): Promise<void> {
  if (!extensionLogger) return;
  await extensionLogger.log({ type: "session_end" });
  await extensionLogger.flush().catch(() => undefined);
}
