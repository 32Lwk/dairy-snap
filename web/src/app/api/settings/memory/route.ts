import { type NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const JSON_NO_CACHE = {
  headers: {
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Vary: "Cookie",
  },
} as const;

/** List diary dates (recent), full grouped overview, or memory snapshot for one date. */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const entryDateYmd = new URL(req.url).searchParams.get("entryDateYmd")?.trim() ?? "";

  const entries = await prisma.dailyEntry.findMany({
    where: { userId: session.user.id },
    select: { id: true, entryDateYmd: true, encryptionMode: true },
    orderBy: { entryDateYmd: "desc" },
    take: 400,
  });
  const entryDates = entries.map((d) => d.entryDateYmd);
  const entryIdToMeta = new Map(entries.map((e) => [e.id, e] as const));

  if (!entryDateYmd) {
    const [allShort, allLong, agentMemory] = await Promise.all([
      prisma.memoryShortTerm.findMany({
        where: { userId: session.user.id },
        orderBy: [{ updatedAt: "desc" }],
      }),
      prisma.memoryLongTerm.findMany({
        where: { userId: session.user.id },
        orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
      }),
      prisma.agentMemory.findMany({
        where: { userId: session.user.id },
        orderBy: [{ domain: "asc" }, { memoryKey: "asc" }],
        take: 200,
      }),
    ]);

    const shortByEntry = new Map<string, typeof allShort>();
    for (const row of allShort) {
      const list = shortByEntry.get(row.entryId) ?? [];
      list.push(row);
      shortByEntry.set(row.entryId, list);
    }

    /** 日記一覧は直近 400 件のみ。短期・長期の参照先がそれより古い日でも DB 上は残るため、メタと一覧を補完する。 */
    const coveredEntryIds = new Set(entries.map((e) => e.id));
    const shortEntryIdsBeyondWindow = [...shortByEntry.keys()].filter((id) => !coveredEntryIds.has(id));
    const longSourceIdsNeedingMeta = [
      ...new Set(
        allLong.map((r) => r.sourceEntryId).filter((id): id is string => id != null),
      ),
    ].filter((id) => !entryIdToMeta.has(id));
    const extraEntryIds = [...new Set([...shortEntryIdsBeyondWindow, ...longSourceIdsNeedingMeta])];
    if (extraEntryIds.length > 0) {
      const extraRows = await prisma.dailyEntry.findMany({
        where: { userId: session.user.id, id: { in: extraEntryIds } },
        select: { id: true, entryDateYmd: true, encryptionMode: true },
      });
      for (const e of extraRows) entryIdToMeta.set(e.id, e);
    }

    const shortTermGroupsFromRecent = entries.map((e) => ({
      entryId: e.id,
      entryDateYmd: e.entryDateYmd,
      encryptionMode: e.encryptionMode,
      items: shortByEntry.get(e.id) ?? [],
    }));
    let shortTermGroups = shortTermGroupsFromRecent;
    if (shortEntryIdsBeyondWindow.length > 0) {
      const beyondGroups = shortEntryIdsBeyondWindow
        .map((id) => entryIdToMeta.get(id))
        .filter((m): m is (typeof entries)[number] => m != null)
        .sort((a, b) => b.entryDateYmd.localeCompare(a.entryDateYmd))
        .map((e) => ({
          entryId: e.id,
          entryDateYmd: e.entryDateYmd,
          encryptionMode: e.encryptionMode,
          items: shortByEntry.get(e.id) ?? [],
        }));
      shortTermGroups = [...shortTermGroupsFromRecent, ...beyondGroups];
    }

    const longByKey = new Map<
      string,
      { entryDateYmd: string | null; entryId: string | null; items: typeof allLong }
    >();
    for (const row of allLong) {
      const sid = row.sourceEntryId;
      const key = sid ? `entry:${sid}` : "common";
      const meta = sid ? entryIdToMeta.get(sid) : undefined;
      let bucket = longByKey.get(key);
      if (!bucket) {
        bucket = {
          entryDateYmd: meta?.entryDateYmd ?? null,
          entryId: sid,
          items: [],
        };
        longByKey.set(key, bucket);
      }
      bucket.items.push(row);
    }
    const longTermGroups = [...longByKey.entries()]
      .map(([key, g]) => ({
        key,
        entryDateYmd: g.entryDateYmd,
        entryId: g.entryId,
        items: g.items,
      }))
      .sort((a, b) => {
        if (a.key === "common") return 1;
        if (b.key === "common") return -1;
        const ya = a.entryDateYmd;
        const yb = b.entryDateYmd;
        if (ya && yb) return yb.localeCompare(ya);
        if (ya && !yb) return -1;
        if (!ya && yb) return 1;
        return a.key.localeCompare(b.key);
      });

    /** 自動記憶のバックフィルが「まだ追いついていない」エントリ数（未実行 or メッセージが増えた） */
    const threadsForPending = await prisma.chatThread.findMany({
      where: { entry: { userId: session.user.id } },
      select: {
        entryId: true,
        memoryChatBackfillAt: true,
        memoryChatBackfillMsgCount: true,
        _count: {
          select: {
            messages: { where: { role: { in: ["user", "assistant"] } } },
          },
        },
      },
    });
    const pendingEntryIds = new Set<string>();
    for (const t of threadsForPending) {
      const ua = t._count.messages;
      if (ua < 2) continue;
      const snapshotCurrent =
        t.memoryChatBackfillAt != null &&
        t.memoryChatBackfillMsgCount != null &&
        t.memoryChatBackfillMsgCount === ua;
      if (!snapshotCurrent) pendingEntryIds.add(t.entryId);
    }
    const pendingChatMemoryBackfillCount = pendingEntryIds.size;

    return NextResponse.json(
      {
        entryDates,
        entries,
        shortTermGroups,
        longTermGroups,
        agentMemory,
        pendingChatMemoryBackfillCount,
      },
      JSON_NO_CACHE,
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDateYmd)) {
    return NextResponse.json({ error: "entryDateYmd must be YYYY-MM-DD", entryDates }, { status: 400, ...JSON_NO_CACHE });
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { userId: session.user.id, entryDateYmd },
    select: { id: true, entryDateYmd: true, encryptionMode: true },
  });

  if (!entry) {
    return NextResponse.json(
      { entry: null, shortTerm: [], longTermForEntry: [], longTermOther: [], agentMemory: [], entryDates },
      JSON_NO_CACHE,
    );
  }

  const [shortTerm, longForEntry, longOther, agentMemory] = await Promise.all([
    prisma.memoryShortTerm.findMany({
      where: { userId: session.user.id, entryId: entry.id },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.memoryLongTerm.findMany({
      where: { userId: session.user.id, sourceEntryId: entry.id },
      orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
    }),
    prisma.memoryLongTerm.findMany({
      where: {
        userId: session.user.id,
        OR: [{ sourceEntryId: null }, { sourceEntryId: { not: entry.id } }],
      },
      orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    prisma.agentMemory.findMany({
      where: { userId: session.user.id },
      orderBy: [{ domain: "asc" }, { memoryKey: "asc" }],
      take: 200,
    }),
  ]);

  return NextResponse.json(
    {
      entry,
      shortTerm,
      longTermForEntry: longForEntry,
      longTermOther: longOther,
      agentMemory,
      entryDates,
    },
    JSON_NO_CACHE,
  );
}
