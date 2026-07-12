import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { checkAndConsumeLimits, reconcileUsage, type RateLimitReason } from "@/lib/rateLimit";
import {
  GEMINI_MODEL,
  GeminiNotConfiguredError,
  streamChatReply,
  type ChatHistoryItem,
  type GeminiUsage,
} from "@/lib/gemini";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 8000;

/**
 * Rough pre-flight token estimate (message + running history), padded with a
 * fudge factor since we don't know the reply length up front. Corrected
 * afterwards via reconcileUsage() once Gemini returns real usageMetadata —
 * never trust client-supplied token counts.
 */
function estimateTokens(message: string, historyContents: string[]): number {
  const totalChars = message.length + historyContents.reduce((sum, c) => sum + c.length, 0);
  const base = Math.ceil(totalChars / 4);
  return base + Math.ceil(base * 0.25) + 50;
}

function rateLimitMessage(reason: RateLimitReason): string {
  switch (reason) {
    case "GLOBAL_RPM_TPM":
    case "GLOBAL_RPD":
      return "現在アクセスが集中しています。しばらく待ってから再度お試しください。";
    case "USER_DAILY_REQ":
    case "USER_DAILY_TOKEN":
      return "本日のご利用上限に達しました。明日またご利用ください。";
  }
}

export async function POST(request: NextRequest) {
  // Light CSRF defense-in-depth (alongside the sameSite=lax session cookie):
  // only same-origin fetch() calls from our own chat UI set this header.
  if (request.headers.get("x-requested-with") !== "chat-ui") {
    return NextResponse.json(
      { error: "bad_request", message: "不正なリクエストです。" },
      { status: 400 }
    );
  }

  const session = await getSession().catch(() => null);
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", message: "ログインが必要です。" },
      { status: 401 }
    );
  }
  const { user } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "リクエストの形式が不正です。" },
      { status: 400 }
    );
  }

  const parsed = body as { conversationId?: unknown; message?: unknown } | null;
  const conversationId = typeof parsed?.conversationId === "string" ? parsed.conversationId : null;
  const rawMessage = typeof parsed?.message === "string" ? parsed.message : null;

  if (!conversationId || !rawMessage || !rawMessage.trim()) {
    return NextResponse.json(
      { error: "bad_request", message: "メッセージを入力してください。" },
      { status: 400 }
    );
  }

  const message = rawMessage.trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: "message_too_long",
        message: `メッセージは${MAX_MESSAGE_LENGTH}文字以内で入力してください。`,
      },
      { status: 400 }
    );
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userId: true,
      title: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      },
    },
  });

  // 404 rather than 403 so we don't confirm another user's conversation IDs
  // exist — mirrors the notFound() behavior in the chat page.
  if (!conversation || conversation.userId !== user.id) {
    return NextResponse.json(
      { error: "not_found", message: "会話が見つかりません。" },
      { status: 404 }
    );
  }

  const estimatedTokens = estimateTokens(
    message,
    conversation.messages.map((m) => m.content)
  );

  const limitResult = await checkAndConsumeLimits(user.id, estimatedTokens);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: limitResult.reason, message: rateLimitMessage(limitResult.reason) },
      { status: 429 }
    );
  }

  const isFirstMessage = conversation.messages.length === 0;

  // Persist the user's message immediately (FR-12: every input must be
  // durably logged, independent of whether Gemini ever responds), and bump
  // Conversation so it sorts to the top of the sidebar.
  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: conversation.id, role: "USER", content: message },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { title: isFirstMessage ? message.slice(0, 50) : conversation.title },
    }),
  ]);

  const history: ChatHistoryItem[] = [
    ...conversation.messages.map((m) => ({ role: m.role, content: m.content })),
    { role: "USER", content: message },
  ];

  let streamResult: ReturnType<typeof streamChatReply>;
  try {
    // Synchronous: throws immediately (before any network call) if
    // GEMINI_API_KEY is unset, so we can still return a normal JSON error
    // here instead of failing mid-stream.
    streamResult = streamChatReply(history);
  } catch (err) {
    // The user's message is already logged; no LLM call happened, so give
    // back the estimated quota we just consumed.
    await reconcileUsage({ userId: user.id, estimatedTokens, actualTokens: 0 }).catch((e) =>
      console.error("reconcileUsage failed after stream-start error", e)
    );

    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json(
        {
          error: "gemini_not_configured",
          message: "Gemini APIキーが未設定です。管理者に連絡してください。",
        },
        { status: 503 }
      );
    }

    console.error("Failed to start Gemini stream", err);
    return NextResponse.json(
      {
        error: "gemini_error",
        message: "応答の生成中にエラーが発生しました。しばらくしてから再度お試しください。",
      },
      { status: 502 }
    );
  }

  const { textStream, usage: usagePromise } = streamResult;
  const encoder = new TextEncoder();

  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      let streamFailed = false;

      try {
        for await (const chunk of textStream) {
          fullText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        streamFailed = true;
        console.error("Gemini stream error", err);
        const notice =
          fullText.length > 0
            ? "\n\n[エラー: 応答が途中で中断されました。]"
            : "エラー: 応答の生成に失敗しました。しばらくしてから再度お試しください。";
        controller.enqueue(encoder.encode(notice));
        fullText += notice;
      }

      let usage: GeminiUsage = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
      if (!streamFailed) {
        try {
          usage = await usagePromise;
        } catch (err) {
          console.error("Failed to obtain Gemini usage metadata", err);
        }
      }

      // Persist the assistant reply (or partial/error text) + real usage
      // numbers together (FR-12). Never trust client-supplied token counts —
      // these come straight from the API's usageMetadata.
      try {
        await prisma.$transaction(async (tx) => {
          const assistantMessage = await tx.message.create({
            data: { conversationId: conversation.id, role: "ASSISTANT", content: fullText },
          });
          await tx.usageLog.create({
            data: {
              userId: user.id,
              messageId: assistantMessage.id,
              promptTokens: usage.promptTokenCount,
              completionTokens: usage.candidatesTokenCount,
              totalTokens: usage.totalTokenCount,
              model: GEMINI_MODEL,
            },
          });
        });
      } catch (err) {
        console.error("Failed to persist assistant message / usage log", err);
      }

      try {
        // Fall back to the pre-flight estimate (rather than 0) when we never
        // got real usage back, so a failed call doesn't under-count against
        // the free-tier budget that FR-13/NFR-07 exist to protect.
        await reconcileUsage({
          userId: user.id,
          estimatedTokens,
          actualTokens: usage.totalTokenCount || estimatedTokens,
        });
      } catch (err) {
        console.error("reconcileUsage failed", err);
      }

      controller.close();
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
