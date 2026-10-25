import * as vscode from "vscode";

export type FromWebview =
  | { type: "ready" }
  | { type: "activate"; code: string }
  | { type: "consent"; use: boolean; metadata: boolean; content: boolean }
  | { type: "send"; text: string }
  | { type: "cancel" }
  | { type: "approval"; id: string; decision: "approve" | "reject" | "feedback"; feedback?: string }
  | { type: "newConversation" }
  | { type: "setPaused"; paused: boolean }
  | { type: "showConsent" }
  | { type: "refresh" };

export type Screen = "activate" | "consent" | "denied" | "chat" | "noWorkspace" | "offline";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private queue: unknown[] = [];

  constructor(
    private extensionUri: vscode.Uri,
    private onMessage: (m: FromWebview) => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const media = vscode.Uri.joinPath(this.extensionUri, "media");
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const uri = (f: string) => view.webview.asWebviewUri(vscode.Uri.joinPath(media, f));
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    view.webview.html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri("chat.css")}"></head>
<body><div id="app"></div>
<script nonce="${nonce}" src="${uri("markdown.js")}"></script>
<script nonce="${nonce}" src="${uri("screens.js")}"></script>
<script nonce="${nonce}" src="${uri("chat.js")}"></script>
</body></html>`;
    view.webview.onDidReceiveMessage((m: FromWebview) => this.onMessage(m));
    view.onDidDispose(() => (this.view = undefined));
  }

  post(message: unknown): void {
    if (this.view) void this.view.webview.postMessage(message);
    else this.queue.push(message);
  }

  flushQueue(): void {
    const q = this.queue;
    this.queue = [];
    q.forEach((m) => this.post(m));
  }

  reveal(): void {
    void vscode.commands.executeCommand("researchLlm.chat.focus");
  }
}
