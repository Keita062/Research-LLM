import ResetPasswordForm from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">リンクが不正です</h1>
        <p className="text-sm text-red-600">
          パスワード再設定用のリンクが見つかりません。もう一度お試しください。
        </p>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
