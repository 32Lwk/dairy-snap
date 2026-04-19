import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { upsertDailyEntryForYmd } from "@/server/ensure-daily-entry";
import { prisma } from "@/server/db";
import { EntryByDateMainGrid } from "./entry-by-date-main-grid";

const entryByDateInclude = {
  appendEvents: { orderBy: { occurredAt: "asc" as const } },
  images: true,
  chatThreads: {
    orderBy: { updatedAt: "desc" as const },
    take: 1,
    include: { messages: { orderBy: { createdAt: "asc" as const } } },
  },
} as const;

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

  let entry = await prisma.dailyEntry.findUnique({
    where: {
      userId_entryDateYmd: { userId: r.user.id, entryDateYmd: date },
    },
    include: entryByDateInclude,
  });

  if (!entry) {
    await upsertDailyEntryForYmd(r.user.id, date);
    entry = await prisma.dailyEntry.findUniqueOrThrow({
      where: {
        userId_entryDateYmd: { userId: r.user.id, entryDateYmd: date },
      },
      include: entryByDateInclude,
    });
  }

  const chatThread = entry.chatThreads[0];

  return (
    <div className="mx-auto w-full px-4 py-6 md:max-w-2xl lg:max-w-6xl">
      <header className="max-w-2xl">
        <Link href={`/calendar/${date}`} className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← カレンダー
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{date}</h1>
        {entry.title && <p className="mt-1 text-lg text-zinc-700 dark:text-zinc-300">{entry.title}</p>}
        {entry.mood && (
          <p className="text-sm text-zinc-500">
            気分: {entry.mood}
          </p>
        )}
      </header>

      <EntryByDateMainGrid
        entryId={entry.id}
        initialThreadId={chatThread?.id ?? null}
        initialMessages={
          chatThread?.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            model: m.model,
          })) ?? []
        }
        latitude={entry.latitude}
        longitude={entry.longitude}
        weatherJson={entry.weatherJson}
        body={entry.body}
        appendEvents={entry.appendEvents.map((ev) => ({
          id: ev.id,
          occurredAt: ev.occurredAt.toISOString(),
          fragment: ev.fragment,
        }))}
        images={entry.images.map((i) => ({
          id: i.id,
          mimeType: i.mimeType,
          byteSize: i.byteSize,
        }))}
      />
    </div>
  );
}
