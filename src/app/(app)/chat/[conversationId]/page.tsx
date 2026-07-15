import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import ChatPanel from "./ChatPanel";

/**
 * /chat/[conversationId]: loads and renders one conversation's messages,
 * scoped to the current user (FR-11). Returns 404 if the conversation
 * doesn't exist or belongs to someone else, rather than leaking existence.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await requireUser();

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userId: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          attachments: { select: { id: true, fileName: true, mimeType: true } },
        },
      },
    },
  });

  if (!conversation || conversation.userId !== user.id) {
    notFound();
  }

  return (
    <ChatPanel
      conversationId={conversation.id}
      initialMessages={conversation.messages}
    />
  );
}
