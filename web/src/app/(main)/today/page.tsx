import Link from "next/link";
import { formatYmdTokyo } from "@/lib/time/tokyo";
import { parseUserSettings } from "@/lib/user-settings";
import { prisma } from "@/server/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { EntryChat } from "../entries/[date]/entry-chat";
import { TodayAppendForm } from "./today-append-form";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const ymd = formatYmdTokyo();
  const [userSettingsRow, entry] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { settings: true },
    }),
    prisma.dailyEntry.findUnique({
      where: {
        userId_entryDateYmd: { userId: session.user.id, entryDateYmd: ymd },
      },
      include: {
        chatThreads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: { messages: { orderBy: { createdAt: "asc" } } },
        },
      },
    }),
  ]);

  const prof = parseUserSettings(userSettingsRow?.settings ?? {}).profile;
  if (!prof?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const chatThread = entry?.chatThreads[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">今日</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {ymd}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          チャットで振り返り、追記は横（モバイルは下）のフォームから。タイムゾーンは Asia/Tokyo 固定です。
        </p>
      </header>

      {!entry?.id ? (
        <div className="mt-8 max-w-xl">
          <TodayAppendForm entryDateYmd={ymd} initialBody="" />
          <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
            まずは1行でも追記を保存すると、<strong className="text-zinc-800 dark:text-zinc-200">振り返りチャット</strong>
            が使えるようになります。
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start lg:gap-10">
          <div className="order-1 min-h-0 lg:col-span-8 lg:order-1">
            <div className="lg:sticky lg:top-4 lg:z-10">
              <EntryChat
                key={`${entry.id}-${chatThread?.id ?? "new"}-${chatThread?.messages.length ?? 0}`}
                entryId={entry.id}
                threadId={chatThread?.id ?? null}
                initialMessages={
                  chatThread?.messages.map((m) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                  })) ?? []
                }
                variant="default"
              />
            </div>
          </div>
          <aside className="order-2 space-y-4 lg:col-span-4 lg:order-2">
            <TodayAppendForm entryDateYmd={ymd} initialBody={entry.body ?? ""} />
            <p className="text-center text-sm text-zinc-500 lg:text-left">
              <Link
                href={`/entries/${ymd}`}
                className="text-emerald-700 underline decoration-emerald-700/30 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                画像・天気・AI 操作・追記履歴は詳細ページ
              </Link>
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
