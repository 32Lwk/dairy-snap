import { notFound, redirect } from "next/navigation";
import { buildEntryChatTranscript } from "@/lib/chat/build-entry-chat-transcript";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { upsertDailyEntryForYmd } from "@/server/ensure-daily-entry";
import { prisma } from "@/server/db";
import { readSecurityNoticeJaFromConversationNotes } from "@/lib/chat-thread-security-notice";
import { EntryByDateView } from "./entry-by-date-view";

const entryByDateInclude = {
  appendEvents: { orderBy: { occurredAt: "asc" as const } },
  images: true,
  entryTags: { include: { tag: true } },
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
  const chatSecurityNoticeJa = readSecurityNoticeJaFromConversationNotes(chatThread?.conversationNotes);
  const transcriptMeta = buildEntryChatTranscript(
    (chatThread?.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
  );
  const savedEntryTagsCsv = entry.entryTags.map((et) => et.tag.name).join("、");

  return (
    <EntryByDateView
      date={date}
      entryId={entry.id}
      initialTitle={entry.title ?? ""}
      savedEntryTagsCsv={savedEntryTagsCsv}
      mood={entry.mood}
      entryDateYmd={date}
      chatSecurityNoticeJa={chatSecurityNoticeJa}
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
      images={(entry.images ?? []).map((i) => ({
        id: i.id,
        mimeType: i.mimeType,
        byteSize: i.byteSize,
      }))}
      dominantEmotion={entry.dominantEmotion}
      initialPlutchikAnalysis={entry.plutchikAnalysis}
      transcriptCharCount={transcriptMeta.charCount}
    />
  );
}
