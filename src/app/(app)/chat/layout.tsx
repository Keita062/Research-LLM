import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createConversationAction } from "@/actions/chat";

/**
 * Sidebar shared by /chat and /chat/[conversationId]: new-chat button +
 * conversation list, scoped to the current user (FR-11).
 */
export default async function ChatLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // Only list conversations that have at least one message — an empty
  // conversation is created every time "+ 新しい会話" is clicked, and
  // without this filter those placeholders pile up and bury real history.
  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id, messages: { some: {} } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
    take: 50,
  });

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <form action={createConversationAction} className="p-3">
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 新しい会話
          </button>
        </form>
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
              会話履歴はまだありません。
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}`}
                    className="block truncate rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
