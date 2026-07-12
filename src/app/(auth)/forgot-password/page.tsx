"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction } from "@/actions/password";
import { initialFormState } from "@/lib/formState";

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialFormState
  );

  if (state.status === "success") {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">送信しました</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{state.message}</p>
        <Link href="/login" className="underline">
          ログイン画面へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-center">パスワード再設定</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        登録済みのメールアドレスを入力してください。再設定用のリンクをお送りします。
      </p>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          {state.fieldErrors?.email && (
            <p className="mt-1 text-sm text-red-600">{state.fieldErrors.email[0]}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "送信中..." : "再設定用リンクを送信"}
        </button>
      </form>

      <p className="text-center text-sm">
        <Link href="/login" className="underline">
          ログイン画面へ戻る
        </Link>
      </p>
    </div>
  );
}
