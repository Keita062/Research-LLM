"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, resendVerificationAction } from "@/actions/auth";
import { initialFormState } from "@/lib/formState";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialFormState
  );
  const [resendState, resendFormAction, isResendPending] = useActionState(
    resendVerificationAction,
    initialFormState
  );
  const [showResend, setShowResend] = useState(false);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-center">ログイン</h1>

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
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {state.status === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      <div className="flex justify-between text-sm">
        <Link href="/signup" className="underline">
          アカウント作成
        </Link>
        <Link href="/forgot-password" className="underline">
          パスワードをお忘れですか？
        </Link>
      </div>

      <div className="border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setShowResend((v) => !v)}
          className="underline"
        >
          確認メールが届いていない場合はこちら
        </button>

        {showResend && (
          <form action={resendFormAction} className="mt-3 space-y-2">
            <label htmlFor="resend-email" className="block text-sm font-medium">
              メールアドレス
            </label>
            <input
              id="resend-email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={isResendPending}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 disabled:opacity-50 dark:border-zinc-700"
            >
              {isResendPending ? "送信中..." : "確認メールを再送する"}
            </button>
            {resendState.status !== "idle" && (
              <p className="text-sm text-green-600">{resendState.message}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
