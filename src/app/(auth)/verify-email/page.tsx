import Link from "next/link";
import { verifyEmailAction } from "@/actions/auth";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const result = token
    ? await verifyEmailAction(token)
    : { status: "error" as const, message: "確認リンクが不正です。" };

  return (
    <div className="space-y-6 text-center">
      <h1 className="text-2xl font-semibold">メールアドレスの確認</h1>
      <p
        className={
          result.status === "success"
            ? "text-sm text-green-600"
            : "text-sm text-red-600"
        }
      >
        {result.message}
      </p>
      <Link href="/login" className="underline">
        ログイン画面へ
      </Link>
    </div>
  );
}
