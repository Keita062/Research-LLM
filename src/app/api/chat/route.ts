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
import {
  classifyAttachment,
  normalizedMimeType,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type StoredAttachment,
} from "@/lib/attachments";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 8000;

/**
 * Rough pre-flight token estimate (message + running history + attachments),
 * padded with a fudge factor since we don't know the reply length up front.
 * Corrected afterwards via reconcileUsage() once Gemini returns real
 * usageMetadata — never trust client-supplied token counts. Image tokens use
 * Gemini's flat per-image estimate; text-ish attachments (CSV/Excel) are
 * approximated from their raw byte size since the real extracted-text length
 * isn't known until send time.
 */
function estimateTokens(
  message: string,
  historyContents: string[],
  newAttachments: StoredAttachment[]
): number {
  const totalChars = message.length + historyContents.reduce((sum, c) => sum + c.length, 0);
  const base = Math.ceil(totalChars / 4);
  const attachmentTokens = newAttachments.reduce((sum, a) => {
    const kind = classifyAttachment(a.fileName, a.mimeType);
    return sum + (kind === "image" ? 260 : Math.ceil(a.data.byteLength / 4));
  }, 0);
  return base + Math.ceil(base * 0.25) + attachmentTokens + 50;
}

function attachmentErrorMessage(fileName: string): string {
  return `「${fileName}」は対応していない形式です。画像(PNG/JPEG/WebP/GIF)、CSV、Excel(.xlsx)のみ添付できます。`;
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "リクエストの形式が不正です。" },
      { status: 400 }
    );
  }

  const conversationId = formData.get("conversationId");
  const rawMessage = formData.get("message");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (typeof conversationId !== "string" || !conversationId) {
    return NextResponse.json(
      { error: "bad_request", message: "会話が指定されていません。" },
      { status: 400 }
    );
  }

  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";

  if (!message && files.length === 0) {
    return NextResponse.json(
      { error: "bad_request", message: "メッセージまたは添付ファイルを入力してください。" },
      { status: 400 }
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: "message_too_long",
        message: `メッセージは${MAX_MESSAGE_LENGTH}文字以内で入力してください。`,
      },
      { status: 400 }
    );
  }

  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return NextResponse.json(
      {
        error: "too_many_attachments",
        message: `添付ファイルは${MAX_ATTACHMENTS_PER_MESSAGE}件までです。`,
      },
      { status: 400 }
    );
  }

  const newAttachments: StoredAttachment[] = [];
  for (const file of files) {
    const kind = classifyAttachment(file.name, file.type);
    if (!kind) {
      return NextResponse.json(
        { error: "unsupported_attachment", message: attachmentErrorMessage(file.name) },
        { status: 400 }
      );
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        {
          error: "attachment_too_large",
          message: `「${file.name}」のサイズが大きすぎます(上限${Math.floor(
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
          )}MB)。`,
        },
        { status: 400 }
      );
    }
    newAttachments.push({
      fileName: file.name,
      mimeType: normalizedMimeType(kind, file.type),
      data: Buffer.from(await file.arrayBuffer()),
    });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userId: true,
      title: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          content: true,
          attachments: { select: { fileName: true, mimeType: true, data: true } },
        },
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
    conversation.messages.map((m) => m.content),
    newAttachments
  );

  const limitResult = await checkAndConsumeLimits(user.id, estimatedTokens);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: limitResult.reason, message: rateLimitMessage(limitResult.reason) },
      { status: 429 }
    );
  }

  const isFirstMessage = conversation.messages.length === 0;
  const titleSource = message || newAttachments[0]?.fileName || "新しい会話";

  // Persist the user's message (+ attachments) immediately (FR-12: every
  // input must be durably logged, independent of whether Gemini ever
  // responds), and bump Conversation so it sorts to the top of the sidebar.
  await prisma.$transaction(async (tx) => {
    const userMessage = await tx.message.create({
      data: { conversationId: conversation.id, role: "USER", content: message },
    });
    if (newAttachments.length > 0) {
      await tx.attachment.createMany({
        data: newAttachments.map((a) => ({
          messageId: userMessage.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          // Buffer defaults to the wider Buffer<ArrayBufferLike>, but
          // Buffer.from() is always ArrayBuffer-backed in practice —
          // Prisma's generated type is just narrower than Node's own types.
          data: a.data as Buffer<ArrayBuffer>,
        })),
      });
    }
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { title: isFirstMessage ? titleSource.slice(0, 50) : conversation.title },
    });
  });

  const history: ChatHistoryItem[] = [
    ...conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments.map((a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
        data: Buffer.from(a.data),
      })),
    })),
    { role: "USER", content: message, attachments: newAttachments },
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
