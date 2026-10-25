import type { Part } from "@google/genai";
import type { ChatChunk, ChatRequest, LlmClient } from "./llm.js";

/**
 * GEMINI_API_KEY 未設定時のローカル確認用モック。
 * 依頼に "/mock-list" "/mock-edit" "/mock-run" を含めるとツール呼び出しを返す
 */
export class MockLlmClient implements LlmClient {
  async *stream(req: ChatRequest): AsyncGenerator<ChatChunk> {
    const last = req.contents[req.contents.length - 1];
    const text = last?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const toolResult = last?.parts?.find((p) => p.functionResponse)?.functionResponse;
    const parts: Part[] = [];
    if (toolResult) {
      parts.push({ text: `（モック）ツール ${toolResult.name} の結果を受け取りました。` });
    } else if (text.includes("/mock-list")) {
      parts.push({ text: "（モック）ファイル一覧を確認します。" }, { functionCall: { name: "list_files", args: { path: "." } } });
    } else if (text.includes("/mock-edit")) {
      parts.push(
        { text: "（モック）ファイルを作成します。" },
        { functionCall: { name: "write_file", args: { path: "mock-output.txt", content: "Hello from mock agent\n" } } },
      );
    } else if (text.includes("/mock-run")) {
      parts.push({ text: "（モック）コマンドを実行します。" }, { functionCall: { name: "run_command", args: { command: "node --version" } } });
    } else {
      parts.push({ text: `（モック応答）依頼を受け取りました：${text.slice(0, 200)}` });
    }
    for (const p of parts) if (p.text) yield { type: "text", text: p.text };
    const chars = JSON.stringify(req.contents).length;
    yield { type: "done", content: { role: "model", parts }, usage: { inputTokens: Math.ceil(chars / 4), outputTokens: 20 } };
  }
}
