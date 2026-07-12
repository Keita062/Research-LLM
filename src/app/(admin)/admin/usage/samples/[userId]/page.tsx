import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/rbac";
import { getUserMessageSamples } from "@/lib/adminQueries";

export const metadata = {
  title: "チャット内容サンプル | 管理画面",
};

const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * FR-19d / NFR-05: chat content sample viewer. Deliberately scoped to a
 * single user (never surfaced inline in the ranking table) and clearly
 * labeled as sensitive personal data.
 */
export default async function UserSamplePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const { user, messages } = await getUserMessageSamples(userId);

  if (!user) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/usage"
        className="w-fit text-sm text-[#256abf] hover:underline dark:text-[#5598e7]"
      >
        ← 利用統計ダッシュボードに戻る
      </Link>

      <div className="rounded-lg border border-[#fab219]/40 bg-[#fab219]/10 px-4 py-3 text-sm text-[#0b0b0b] dark:text-white">
        <strong>取り扱い注意（機微な個人利用データ）：</strong>{" "}
        以下は {user.name}さん（{user.email}）本人のチャット入出力そのものです。研究室内での利用状況分析という目的の範囲でのみ閲覧し、
        第三者への共有・転載は行わないでください。
      </div>

      <h1 className="text-xl font-semibold text-[#0b0b0b] dark:text-white">
        {user.name} さんのチャット内容サンプル（最新{messages.length}件）
      </h1>

      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-[#898781]">このユーザーの利用ログはまだありません。</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a1a]"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#898781]">
              <span>
                <span
                  className={
                    "mr-2 inline-block rounded px-1.5 py-0.5 font-medium " +
                    (m.role === "USER"
                      ? "bg-[#2a78d6]/10 text-[#2a78d6] dark:text-[#3987e5]"
                      : "bg-[#1baf7a]/10 text-[#1baf7a] dark:text-[#199e70]")
                  }
                >
                  {m.role === "USER" ? "ユーザー入力" : "AI応答"}
                </span>
                {m.conversation.title}
              </span>
              <span className="tabular-nums">{dateFmt.format(m.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-[#0b0b0b] dark:text-[#f2f2f0]">
              {m.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
