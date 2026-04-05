import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { prisma } from "@/server/db";
import { EntryActions } from "./entry-actions";
import { EntryChat } from "./entry-chat";
import { EntryImages } from "./entry-images";

export default async function EntryByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const entry = await prisma.dailyEntry.findUnique({
    where: {
      userId_entryDateYmd: { userId: r.user.id, entryDateYmd: date },
    },
    include: {
      appendEvents: { orderBy: { occurredAt: "asc" } },
      entryTags: { include: { tag: true } },
      images: true,
      chatThreads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!entry) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-zinc-600 dark:text-zinc-400">この日のエントリはまだありません。</p>
        <Link href="/today" className="mt-4 inline-block text-emerald-700 underline dark:text-emerald-400">
          今日の入力へ
        </Link>
      </div>
    );
  }

  const chatThread = entry.chatThreads[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="max-w-2xl">
        <Link href="/today" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← 今日
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{date}</h1>
        {entry.title && <p className="mt-1 text-lg text-zinc-700 dark:text-zinc-300">{entry.title}</p>}
        {entry.mood && (
          <p className="text-sm text-zinc-500">
            気分: {entry.mood}
          </p>
        )}
      </header>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start lg:gap-10">
        <div className="order-1 min-h-0 lg:col-span-7">
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

        <div className="order-2 space-y-6 lg:col-span-5">
          <article>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">本文</h2>
            <pre className="mt-2 whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
              {entry.body}
            </pre>
          </article>

          <EntryActions
            entryId={entry.id}
            latitude={entry.latitude}
            longitude={entry.longitude}
            weatherJson={entry.weatherJson}
          />

          {entry.appendEvents.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">追記履歴</h2>
              <ul className="mt-2 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                {entry.appendEvents.map((ev) => (
                  <li key={ev.id}>
                    {ev.occurredAt.toISOString()} — {ev.fragment.slice(0, 80)}
                    {ev.fragment.length > 80 ? "…" : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <EntryImages
            entryId={entry.id}
            images={entry.images.map((i) => ({
              id: i.id,
              mimeType: i.mimeType,
              byteSize: i.byteSize,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
