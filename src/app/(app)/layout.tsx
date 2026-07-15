import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/rbac";

/**
 * Shell for all logged-in-user routes (currently just /chat). Enforces auth
 * via requireUser(), which redirects to /login when there is no valid
 * session — this is the real enforcement boundary for this route group.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <nav className="flex items-center gap-6 text-sm font-medium">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            研究室LLMチャットボット
          </span>
          <Link
            href="/chat"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            チャット
          </Link>
          <Link
            href="/account"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            アカウント
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {user.name} 様
          </span>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
