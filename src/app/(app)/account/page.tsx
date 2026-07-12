import { requireUser } from "@/lib/rbac";
import ChangePasswordForm from "./change-password-form";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto w-full max-w-lg space-y-8 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">アカウント設定</h1>
        <dl className="mt-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="flex gap-2">
            <dt className="font-medium">氏名:</dt>
            <dd>{user.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">メールアドレス:</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h2 className="text-lg font-semibold">パスワード変更</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          現在のパスワードを入力した上で、新しいパスワードを設定してください。
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </div>

      <div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
