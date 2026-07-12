"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "@/actions/auth";
import { initialFormState } from "@/lib/formState";

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState(
    signupAction,
    initialFormState
  );

  if (state.status === "success") {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">確認メールを送信しました</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{state.message}</p>
        <Link href="/login" className="underline">
          ログイン画面へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-center">アカウント作成</h1>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            氏名
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          {state.fieldErrors?.name && (
            <p className="mt-1 text-sm text-red-600">{state.fieldErrors.name[0]}</p>
          )}
        </div>
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
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-500">
            10文字以上、英字・数字をそれぞれ1文字以上含めてください。
          </p>
          {state.fieldErrors?.password && (
            <p className="mt-1 text-sm text-red-600">{state.fieldErrors.password[0]}</p>
          )}
        </div>

        {state.status === "error" && !state.fieldErrors && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "作成中..." : "アカウントを作成"}
        </button>
      </form>

      <p className="text-center text-sm">
        すでにアカウントをお持ちですか？{" "}
        <Link href="/login" className="underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
