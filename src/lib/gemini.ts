import "server-only";
import { GoogleGenAI, type Content } from "@google/genai";
import type { MessageRole } from "@/generated/prisma/client";
import { attachmentToPart, type StoredAttachment } from "./attachments";

/** Model id used for all Gemini calls. Overridable via env for testing / cost control. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

/**
 * Thrown instead of letting the SDK fail cryptically when GEMINI_API_KEY is
 * empty/unset. Callers (API routes) should catch this and show a friendly,
 * Japanese error message rather than a 500.
 */
export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not configured");
    this.name = "GeminiNotConfiguredError";
  }
}

export type ChatHistoryItem = {
  role: MessageRole; // USER | ASSISTANT
  content: string;
  attachments?: StoredAttachment[];
};

export type GeminiUsage = {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
};

const ZERO_USAGE: GeminiUsage = {
  promptTokenCount: 0,
  candidatesTokenCount: 0,
  totalTokenCount: 0,
};

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiNotConfiguredError();
  }
  return new GoogleGenAI({ apiKey });
}

async function toContents(history: ChatHistoryItem[]): Promise<Content[]> {
  return Promise.all(
    history.map(async (m) => {
      const attachmentParts = await Promise.all(
        (m.attachments ?? []).map((a) => attachmentToPart(a))
      );
      const textPart = m.content.trim() !== "" ? [{ text: m.content }] : [];
      return {
        role: m.role === "USER" ? ("user" as const) : ("model" as const),
        parts: [...attachmentParts, ...textPart],
      };
    })
  );
}

/**
 * Non-streaming reply generation. Throws GeminiNotConfiguredError if no API
 * key is set.
 */
export async function generateChatReply(
  history: ChatHistoryItem[]
): Promise<{ text: string; usage: GeminiUsage }> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: await toContents(history),
  });

  const usage = response.usageMetadata;

  return {
    text: response.text ?? "",
    usage: {
      promptTokenCount: usage?.promptTokenCount ?? 0,
      candidatesTokenCount: usage?.candidatesTokenCount ?? 0,
      totalTokenCount: usage?.totalTokenCount ?? 0,
    },
  };
}

export type StreamChatReplyResult = {
  /** Yields plain-text chunks as they arrive from Gemini. */
  textStream: AsyncGenerator<string, void, unknown>;
  /**
   * Resolves once textStream is fully drained, with the usage metadata from
   * the final chunk. Rejects if the underlying stream errors — always drain
   * textStream to completion (or catch its rejection) before awaiting this,
   * otherwise it may never settle.
   */
  usage: Promise<GeminiUsage>;
};

/**
 * Streaming reply generation. Throws GeminiNotConfiguredError *synchronously*
 * (before any network call / ReadableStream is created) if no API key is
 * set, so callers can catch it and return a normal (non-streaming) error
 * response instead of starting a stream that immediately fails.
 */
export function streamChatReply(history: ChatHistoryItem[]): StreamChatReplyResult {
  const ai = getClient();

  let resolveUsage!: (usage: GeminiUsage) => void;
  let rejectUsage!: (err: unknown) => void;
  const usage = new Promise<GeminiUsage>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });

  async function* generator(): AsyncGenerator<string, void, unknown> {
    let lastUsage: GeminiUsage | undefined;
    try {
      const stream = await ai.models.generateContentStream({
        model: GEMINI_MODEL,
        contents: await toContents(history),
      });

      for await (const chunk of stream) {
        if (chunk.text) {
          yield chunk.text;
        }
        if (chunk.usageMetadata) {
          lastUsage = {
            promptTokenCount: chunk.usageMetadata.promptTokenCount ?? 0,
            candidatesTokenCount: chunk.usageMetadata.candidatesTokenCount ?? 0,
            totalTokenCount: chunk.usageMetadata.totalTokenCount ?? 0,
          };
        }
      }

      resolveUsage(lastUsage ?? ZERO_USAGE);
    } catch (err) {
      rejectUsage(err);
      throw err;
    }
  }

  return { textStream: generator(), usage };
}
