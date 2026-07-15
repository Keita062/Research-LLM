"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "@/lib/attachmentConstants";

type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  /** Set only for a not-yet-persisted attachment, via URL.createObjectURL. */
  previewUrl?: string;
  /** True until the message (and thus a real, fetchable attachment id) exists server-side. */
  pending?: boolean;
};

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  attachments?: ChatAttachment[];
};

function AttachmentChip({ attachment }: { attachment: ChatAttachment }) {
  const isImage = attachment.mimeType.startsWith("image/");
  const href = attachment.pending ? undefined : `/api/attachments/${attachment.id}`;

  if (isImage) {
    const src = attachment.previewUrl ?? href;
    const img = (
      // Thumbnails are user-uploaded, dynamically-sized images served from
      // our own attachment endpoint — next/image's fixed-size optimization
      // pipeline isn't a good fit here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={attachment.fileName}
        className="h-24 w-24 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
      />
    );
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {img}
      </a>
    ) : (
      img
    );
  }

  const chip = (
    <span className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      📄 {attachment.fileName}
    </span>
  );
  return href ? <a href={href}>{chip}</a> : chip;
}

export default function ChatPanel({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file later
    if (picked.length === 0) return;

    if (attachedFiles.length + picked.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      setAttachError(`添付ファイルは${MAX_ATTACHMENTS_PER_MESSAGE}件までです。`);
      return;
    }
    const oversized = picked.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (oversized) {
      setAttachError(
        `「${oversized.name}」のサイズが大きすぎます(上限${Math.floor(
          MAX_ATTACHMENT_BYTES / (1024 * 1024)
        )}MB)。`
      );
      return;
    }

    setAttachError(null);
    setAttachedFiles((prev) => [...prev, ...picked]);
  }

  function removeAttachedFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || isSending) return;

    setError(null);
    setAttachError(null);
    setInput("");
    const filesToSend = attachedFiles;
    setAttachedFiles([]);
    setIsSending(true);

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "USER",
      content: text,
      attachments: filesToSend.map((f, i) => ({
        id: `local-attachment-${Date.now()}-${i}`,
        fileName: f.name,
        mimeType: f.type,
        previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        pending: true,
      })),
    };
    const assistantId = `local-assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "ASSISTANT", content: "" },
    ]);

    try {
      const body = new FormData();
      body.append("conversationId", conversationId);
      body.append("message", text);
      for (const file of filesToSend) {
        body.append("files", file);
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "X-Requested-With": "chat-ui" },
        body,
      });

      if (!res.ok || !res.body) {
        let message = "エラーが発生しました。しばらくしてから再度お試しください。";
        try {
          const data = (await res.json()) as { message?: string };
          if (data?.message) message = data.message;
        } catch {
          // response wasn't JSON — keep default message
        }
        setError(message);
        // The failed assistant placeholder has no content to show; drop it.
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const chunkText = accumulated;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: chunkText } : m))
        );
      }
    } catch (err) {
      console.error(err);
      setError("通信エラーが発生しました。ネットワーク接続をご確認ください。");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            メッセージを送信して会話を始めましょう。
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                m.role === "USER"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              {m.attachments && m.attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.attachments.map((a) => (
                    <AttachmentChip key={a.id} attachment={a} />
                  ))}
                </div>
              )}
              {(m.content || !(m.role === "ASSISTANT" && isSending)) && (
                <p className="whitespace-pre-wrap">
                  {m.content || (m.role === "ASSISTANT" && isSending ? "…" : "")}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800"
      >
        {attachError && (
          <p className="text-xs text-red-600 dark:text-red-400">{attachError}</p>
        )}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex items-center gap-1 rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {f.name}
                <button
                  type="button"
                  onClick={() => removeAttachedFile(i)}
                  aria-label={`${f.name}を削除`}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            aria-label="ファイルを添付"
            title="画像・CSV・Excelファイルを添付"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-lg font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            +
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
            placeholder="メッセージを入力..."
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={isSending || (!input.trim() && attachedFiles.length === 0)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            送信
          </button>
        </div>
      </form>
    </div>
  );
}
