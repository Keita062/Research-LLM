import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";

export interface ChatRequest {
  model: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
  systemInstruction?: string;
  signal?: AbortSignal;
}

export type ChatChunk =
  | { type: "text"; text: string }
  | { type: "done"; content: Content; usage: { inputTokens: number; outputTokens: number } };

export class LlmError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface LlmClient {
  stream(req: ChatRequest): AsyncGenerator<ChatChunk>;
}

function isPlainText(p: Part): boolean {
  return typeof p.text === "string" && Object.keys(p).length === 1;
}

/** ストリームで分割されたテキスト部分を連結し、それ以外（関数呼び出し・署名付き部分）はそのまま残す */
export function mergeParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && isPlainText(last) && isPlainText(p)) {
      last.text = (last.text ?? "") + p.text;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

export class GeminiClient implements LlmClient {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async *stream(req: ChatRequest): AsyncGenerator<ChatChunk> {
    let response;
    try {
      response = await this.ai.models.generateContentStream({
        model: req.model,
        contents: req.contents,
        config: {
          systemInstruction: req.systemInstruction,
          tools: req.tools && req.tools.length ? [{ functionDeclarations: req.tools }] : undefined,
          abortSignal: req.signal,
        },
      });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502;
      throw new LlmError(status, (err as Error).message);
    }
    const parts: Part[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const chunk of response) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && !part.thought) yield { type: "text", text: part.text };
      }
      const u = chunk.usageMetadata;
      if (u) {
        inputTokens = u.promptTokenCount ?? inputTokens;
        outputTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
      }
    }
    yield { type: "done", content: { role: "model", parts: mergeParts(parts) }, usage: { inputTokens, outputTokens } };
  }
}
