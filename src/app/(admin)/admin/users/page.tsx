import { requireAdmin } from "@/lib/rbac";
import { getUsersList } from "@/lib/adminQueries";
import { toggleUserActiveAction } from "@/actions/admin";

export const metadata = {
  title: "アカウント管理 | 管理画面",
};

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * FR-18: account list. FR-20: enable/disable per row via a Server Action.
 */
export default async function AdminUsersPage() {
  await requireAdmin();
  const users = await getUsersList();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[#0b0b0b] dark:text-white">
          アカウント管理
        </h1>
        <p className="mt-1 text-sm text-[#898781]">
          登録済みアカウント {users.length} 件
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-[#fcfcfb] dark:border-white/10 dark:bg-[#1a1a1a]">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#e1e0d9] text-left text-[#52514e] dark:border-[#2c2c2a] dark:text-[#c3c2b7]">
              <th className="px-4 py-3 font-medium">ログインID（メール）</th>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">権限</th>
              <th className="px-4 py-3 font-medium">登録日</th>
              <th className="px-4 py-3 font-medium">メール確認</th>
              <th className="px-4 py-3 font-medium">最終ログイン</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-[#e1e0d9] last:border-0 dark:border-[#2c2c2a]"
              >
                <td className="px-4 py-3 text-[#0b0b0b] dark:text-white">
                  {u.email}
                </td>
                <td className="px-4 py-3 text-[#0b0b0b] dark:text-white">
                  {u.name}
                </td>
                <td className="px-4 py-3 text-[#52514e] dark:text-[#c3c2b7]">
                  {u.role === "ADMIN" ? "管理者" : "一般"}
                </td>
                <td className="px-4 py-3 tabular-nums text-[#52514e] dark:text-[#c3c2b7]">
                  {dateFmt.format(u.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {u.emailVerifiedAt ? (
                    <span className="text-[#006300] dark:text-[#0ca30c]">
                      確認済み
                    </span>
                  ) : (
                    <span className="text-[#52514e] dark:text-[#c3c2b7]">
                      未確認
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-[#52514e] dark:text-[#c3c2b7]">
                  {u.lastLoginAt ? dateFmt.format(u.lastLoginAt) : "—"}
                </td>
                <td className="px-4 py-3">
                  {u.isActive ? (
                    <span className="rounded-full bg-[#0ca30c]/10 px-2 py-1 text-xs font-medium text-[#006300] dark:text-[#0ca30c]">
                      有効
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#d03b3b]/10 px-2 py-1 text-xs font-medium text-[#d03b3b]">
                      無効
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <form action={toggleUserActiveAction.bind(null, u.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-[#0b0b0b] transition-colors hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                    >
                      {u.isActive ? "無効化" : "有効化"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
