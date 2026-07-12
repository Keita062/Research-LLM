"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/actions/password";
import { initialFormState } from "@/lib/formState";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialFormState
  );

  if (state.status === "success") {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">パスワードを再設定しました</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{state.message}</p>
        <Link href="/login" className="underline">
          ログイン画面へ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-center">新しいパスワードを設定</h1>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium">
            新しいパスワード
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-500">
            10文字以上、英字・数字をそれぞれ1文字以上含めてください。
          </p>
          {state.fieldErrors?.newPassword && (
            <p className="mt-1 text-sm text-red-600">
              {state.fieldErrors.newPassword[0]}
            </p>
          )}
        </div>

        {state.status === "error" && !state.fieldErrors && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={isPending || !token}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "設定中..." : "パスワードを設定"}
        </button>
      </form>
    </div>
  );
}
