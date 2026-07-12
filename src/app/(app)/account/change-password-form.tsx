"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/actions/password";
import { initialFormState } from "@/lib/formState";

export default function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changePasswordAction,
    initialFormState
  );

  return (
    <form action={formAction} className="space-y-4 max-w-sm">
      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium">
          現在のパスワード
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {state.fieldErrors?.currentPassword && (
          <p className="mt-1 text-sm text-red-600">
            {state.fieldErrors.currentPassword[0]}
          </p>
        )}
      </div>
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
      {state.status === "success" && (
        <p className="text-sm text-green-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isPending ? "変更中..." : "パスワードを変更"}
      </button>
    </form>
  );
}
