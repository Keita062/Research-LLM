import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createConversationAction } from "@/actions/chat";

/**
 * /chat: redirects to the user's most recent conversation, or shows an
 * empty/new-chat state if they have none yet (FR-10, FR-11).
 */
export default async function ChatIndexPage() {
  const user = await requireUser();

  const latest = await prisma.conversation.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (latest) {
    redirect(`/chat/${latest.id}`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-zinc-600 dark:text-zinc-400">
        まだ会話がありません。新しい会話を始めましょう。
      </p>
      <form action={createConversationAction}>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新しい会話を始める
        </button>
      </form>
    </div>
  );
}
