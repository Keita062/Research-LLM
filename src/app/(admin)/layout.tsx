import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/rbac";

export const metadata = {
  title: "管理画面 | 研究室LLMチャットボット",
};

/**
 * Admin shell (FR-17). `requireAdmin()` is the real enforcement boundary —
 * it redirects to /login (no session), /chat (non-admin), etc. Currently a
 * STUB owned by Agent-Auth and will throw until that lands; this layout
 * still renders correctly against the documented contract.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-full flex-col bg-[#f9f9f7] dark:bg-[#0d0d0d]">
      <header className="border-b border-black/10 bg-[#fcfcfb] dark:border-white/10 dark:bg-[#1a1a1a]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-lg font-semibold text-[#0b0b0b] dark:text-white">
              管理画面
            </span>
            <nav className="flex gap-6 text-sm font-medium">
              <Link
                href="/admin/users"
                className="text-[#52514e] transition-colors hover:text-[#0b0b0b] dark:text-[#c3c2b7] dark:hover:text-white"
              >
                アカウント管理
              </Link>
              <Link
                href="/admin/usage"
                className="text-[#52514e] transition-colors hover:text-[#0b0b0b] dark:text-[#c3c2b7] dark:hover:text-white"
              >
                利用統計ダッシュボード
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#898781]">
              {admin.name}（{admin.email}）
            </span>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-sm font-medium text-[#52514e] transition-colors hover:text-[#0b0b0b] dark:text-[#c3c2b7] dark:hover:text-white"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
