import { randomUUID } from "node:crypto";
import { ApiError, type ApiClient, type Content, type Part } from "./apiClient";
import { fileExtension } from "./diff";
import type { EventInput, EventLogger, ImageInput } from "./eventLogger";
import { APPROVAL_REQUIRED, applyEdit, prepareEdit, runCommand, runReadTool, TOOL_DECLARATIONS, type PreparedEdit, type ToolOutcome } from "./tools";

export type Decision = { decision: "approve" } | { decision: "reject" } | { decision: "feedback"; feedback: string };

export interface ApprovalRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
  edit?: PreparedEdit;
}

export interface AgentUi {
  delta(text: string): void;
  modelEnd(): void;
  tool(id: string, name: string, args: Record<string, unknown>, status: "running" | "pending" | "done" | "error" | "rejected", detail?: string): void;
  requestApproval(req: ApprovalRequest): Promise<Decision>;
  confirmContinue(steps: number): Promise<boolean>;
}

export interface AgentSnapshot {
  conversationId: string;
  turnIndex: number;
  history: Content[];
  started: boolean;
}

const MAX_STEPS = 25;

export const SYSTEM_INSTRUCTION = `あなたは VS Code 上で動くコーディングエージェントです。参加者のワークスペース（開いているフォルダ）のファイルを読み書きし、コマンドを実行して開発を手伝います。
- 日本語で簡潔に答えてください。
- パスはワークスペースからの相対パスで指定してください。
- 変更前に関係するファイルを read_file で確認し、小さな変更は edit_file、新規作成や全体の書き換えは write_file を使ってください。
- edit_file・write_file・run_command は参加者の承認後に実行されます。拒否された場合は理由やフィードバックに従って方針を見直してください。
- Unity（C#）や Processing（.pde）のプロジェクトでは、エディタ上の操作（再生・シーン編集など）はできないため、必要な手順は参加者に説明してください。`;

export class Agent {
  conversationId = randomUUID();
  private turnIndex = 0;
  private history: Content[] = [];
  private abort?: AbortController;
  private started = false;
  private lastResponseAt?: number;

  constructor(
    private api: ApiClient,
    private logger: EventLogger,
    private root: () => string,
    private model: () => string,
    private autoApproveEdits: () => boolean = () => false,
  ) {}

  snapshot(): AgentSnapshot {
    return { conversationId: this.conversationId, turnIndex: this.turnIndex, history: this.history, started: this.started };
  }

  restore(s: AgentSnapshot): void {
    Object.assign(this, { conversationId: s.conversationId, turnIndex: s.turnIndex, history: s.history ?? [], started: s.started });
  }

  get busy(): boolean {
    return !!this.abort;
  }

  reset(): void {
    this.cancel();
    this.conversationId = randomUUID();
    this.turnIndex = 0;
    this.history = [];
    this.started = false;
    this.lastResponseAt = undefined;
  }

  cancel(phase = "user"): void {
    if (!this.abort) return;
    this.abort.abort();
    void this.log("user_cancel", { phase });
  }

  private log(type: string, payload: Record<string, unknown>, content?: EventInput["content"]) {
    return this.logger.log({ type, conversationId: this.conversationId, turnIndex: this.turnIndex, payload, content });
  }

  async send(text: string, ui: AgentUi, images: ImageInput[] = []): Promise<void> {
    if (this.abort) throw new Error("busy");
    const abort = (this.abort = new AbortController());
    try {
      if (!this.started) {
        this.started = true;
        await this.log("conversation_start", {});
      }
      this.turnIndex++;
      await this.log(
        "user_prompt",
        { chars: text.length, imageCount: images.length, msSinceLastResponse: this.lastResponseAt ? Date.now() - this.lastResponseAt : null },
        images.length ? { text, images } : { text },
      );
      const parts: Part[] = images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }));
      if (text) parts.unshift({ text });
      this.history.push({ role: "user", parts });
      let budget = MAX_STEPS;
      while (!abort.signal.aborted) {
        if (budget-- <= 0) {
          if (!(await ui.confirmContinue(MAX_STEPS))) return;
          budget = MAX_STEPS - 1;
        }
        const content = await this.callModel(ui, abort.signal);
        if (!content) return;
        const calls = content.parts.filter((p) => p.functionCall);
        if (calls.length === 0) return;
        const { responses, stop } = await this.runTools(calls, ui, abort.signal);
        this.history.push({ role: "user", parts: responses });
        if (stop) return;
      }
    } finally {
      this.abort = undefined;
    }
  }

  private async callModel(ui: AgentUi, signal: AbortSignal): Promise<Content | null> {
    const started = Date.now();
    let text = "";
    try {
      for await (const chunk of this.api.chat({ contents: this.history, tools: TOOL_DECLARATIONS, systemInstruction: SYSTEM_INSTRUCTION }, signal)) {
        if (chunk.type === "text") {
          text += chunk.text;
          ui.delta(chunk.text);
        } else if (chunk.type === "error") {
          throw new ApiError(chunk.status, { error: "upstream_error" });
        } else {
          ui.modelEnd();
          this.lastResponseAt = Date.now();
          const parts = chunk.content.parts ?? [];
          const toolCalls = parts.filter((p) => p.functionCall).length;
          const outputType = toolCalls === 0 ? "text" : text.trim() ? "mixed" : "tool_call";
          await this.log(
            "model_response",
            { chars: text.length, outputType, toolCalls, inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens, model: this.model(), durationMs: Date.now() - started },
            text ? { text } : undefined,
          );
          const content: Content = { role: "model", parts };
          this.history.push(content);
          return content;
        }
      }
      return null;
    } catch (e) {
      ui.modelEnd();
      if (signal.aborted) return null;
      const status = e instanceof ApiError ? e.status : 0;
      await this.log("error", { kind: "chat", status, reason: e instanceof ApiError ? (e.body.reason ?? e.body.scope ?? e.body.error ?? null) : null });
      // 失敗したターンの入力を履歴から外し、再送できるようにする
      if (this.history.at(-1)?.role === "user") this.history.pop();
      throw e;
    }
  }

  private async runTools(calls: Part[], ui: AgentUi, signal: AbortSignal): Promise<{ responses: Part[]; stop: boolean }> {
    const responses: Part[] = [];
    let stop = false;
    for (const part of calls) {
      const call = part.functionCall!;
      const id = call.id ?? randomUUID();
      const args = call.args ?? {};
      const needsApproval = APPROVAL_REQUIRED.has(call.name);
      const respond = (response: Record<string, unknown>) => responses.push({ functionResponse: { id: call.id, name: call.name, response } });
      await this.log("tool_call", { toolName: call.name, needsApproval, fileExtension: typeof args.path === "string" ? fileExtension(args.path) : null });
      if (stop || signal.aborted) {
        respond({ error: "参加者がこの操作を中止しました" });
        continue;
      }
      const started = Date.now();
      let outcome: ToolOutcome;
      try {
        let edit: PreparedEdit | undefined;
        if (call.name === "edit_file" || call.name === "write_file") edit = await prepareEdit(this.root(), call.name, args);
        if (needsApproval && edit && this.autoApproveEdits()) {
          await this.log("tool_decision", { toolName: call.name, decision: "auto_approved", decisionMs: 0 });
        } else if (needsApproval) {
          ui.tool(id, call.name, args, "pending");
          const asked = Date.now();
          const d = await ui.requestApproval({ id, name: call.name, args, edit });
          const decision = { approve: "approved", reject: "rejected", feedback: "rejected_with_feedback" }[d.decision];
          await this.log("tool_decision", { toolName: call.name, decision, decisionMs: Date.now() - asked }, d.decision === "feedback" ? { feedback: d.feedback } : undefined);
          if (d.decision !== "approve") {
            ui.tool(id, call.name, args, "rejected", d.decision === "feedback" ? d.feedback : undefined);
            respond(d.decision === "feedback" ? { error: "参加者が拒否しました", feedback: d.feedback } : { error: "参加者が拒否しました" });
            if (d.decision === "reject") stop = true;
            continue;
          }
        }
        ui.tool(id, call.name, args, "running");
        outcome = edit ? await applyEdit(edit) : call.name === "run_command" ? await runCommand(this.root(), String(args.command ?? ""), signal) : await runReadTool(this.root(), call.name, args);
        const success = call.name === "run_command" ? outcome.meta.exitCode === 0 : true;
        ui.tool(id, call.name, args, success ? "done" : "error");
        await this.log("tool_result", { toolName: call.name, success, durationMs: Date.now() - started, ...outcome.meta });
        respond(outcome.response);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        ui.tool(id, call.name, args, "error", message);
        await this.log("tool_result", { toolName: call.name, success: false, durationMs: Date.now() - started, errorKind: e instanceof Error ? e.name : "unknown" });
        respond({ error: message });
      }
    }
    return { responses, stop };
  }
}
