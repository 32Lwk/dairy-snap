import type { Prisma } from "@/generated/prisma/client";
import { formatYmdTokyo } from "@/lib/time/tokyo";
import { CALENDAR_OPENING_BUILTIN_CATS, labelToUserCategoryId } from "@/lib/user-settings";
import { prisma } from "@/server/db";
import { searchEmbeddings } from "@/server/embeddings";

function readCustomCategoryLabels(settings: Prisma.JsonValue): string[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return [];
  const co = (settings as Record<string, unknown>).calendarOpening;
  if (!co || typeof co !== "object" || Array.isArray(co)) return [];
  const labels = (co as Record<string, unknown>).customCategoryLabels;
  if (!Array.isArray(labels)) return [];
  return labels.filter((x): x is string => typeof x === "string");
}

export type SearchHitKind = "entry" | "append" | "chat" | "gcal" | "vector_entry" | "vector_append" | "vector_chat" | "vector_gcal";

export type UnifiedSearchHit = {
  key: string;
  kind: SearchHitKind;
  entryDateYmd: string | null;
  calendarYmd: string | null;
  title: string | null;
  snippet: string;
  href: string;
  badge: string;
  score: number;
};

function ymdFromStartIso(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return formatYmdTokyo();
  return formatYmdTokyo(new Date(ms));
}

function clip(s: string, n = 220): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

const KW = 1;

/** 検索語に一致する開口カテゴリ ID（組み込みラベル・カスタム表示名から解決） */
async function matchingFixedCategoryIds(userId: string, q: string): Promise<string[]> {
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  const ids = new Set<string>();
  for (const c of CALENDAR_OPENING_BUILTIN_CATS) {
    if (c.id.toLowerCase().includes(ql) || c.label.toLowerCase().includes(ql)) ids.add(c.id);
  }
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
  const custom = readCustomCategoryLabels(row?.settings ?? null);
  for (const lab of custom) {
    if (lab.trim().toLowerCase().includes(ql)) ids.add(labelToUserCategoryId(lab));
  }
  return [...ids];
}

function categoryDisplay(fixedCategory: string | null | undefined): string {
  const fc = fixedCategory?.trim();
  if (!fc) return "";
  const b = CALENDAR_OPENING_BUILTIN_CATS.find((x) => x.id === fc);
  if (b) return b.label;
  if (fc.startsWith("usercat:")) return fc.slice("usercat:".length).replace(/_/g, " ");
  return fc;
}

function gcalSnippetLine(g: {
  calendarName: string | null;
  title: string;
  location: string;
  description: string;
  eventSearchBlob: string;
  fixedCategory: string | null;
}): string {
  const cat = categoryDisplay(g.fixedCategory);
  const extra = (g.description ?? "").trim() ? "" : (g.eventSearchBlob ?? "").trim().slice(0, 400);
  return [
    cat ? `\u30ab\u30c6\u30b4\u30ea: ${cat}` : "",
    g.calendarName,
    g.title,
    g.location,
    g.description,
    extra,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
}

function entrySnippetBody(
  e: {
    body: string;
    title: string | null;
    entryTags: { tag: { name: string } }[];
  },
): string {
  const tagNames = e.entryTags.map((x) => x.tag.name).filter(Boolean);
  const bodyPart = e.body || e.title || "";
  if (tagNames.length === 0) return bodyPart;
  return `${tagNames.join(", ")} \u00b7 ${bodyPart}`;
}

export async function unifiedSearch(
  userId: string,
  q: string,
): Promise<{ hits: UnifiedSearchHit[]; semanticOk: boolean }> {
  const hitsMap = new Map<string, UnifiedSearchHit>();
  const add = (h: UnifiedSearchHit) => {
    const prev = hitsMap.get(h.key);
    if (!prev || h.score > prev.score) hitsMap.set(h.key, h);
  };

  const categoryIds = await matchingFixedCategoryIds(userId, q);
  const gcalOr = [
    { title: { contains: q, mode: "insensitive" as const } },
    { location: { contains: q, mode: "insensitive" as const } },
    { description: { contains: q, mode: "insensitive" as const } },
    { eventSearchBlob: { contains: q, mode: "insensitive" as const } },
    { fixedCategory: { contains: q, mode: "insensitive" as const } },
    ...(categoryIds.length > 0 ? [{ fixedCategory: { in: categoryIds } }] : []),
  ];

  const [entries, appends, chats, gcals] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: {
        userId,
        encryptionMode: "STANDARD",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { body: { contains: q, mode: "insensitive" } },
          { mood: { contains: q, mode: "insensitive" } },
          {
            entryTags: {
              some: { tag: { name: { contains: q, mode: "insensitive" } } },
            },
          },
        ],
      },
      orderBy: { entryDateYmd: "desc" },
      take: 50,
      select: {
        id: true,
        entryDateYmd: true,
        title: true,
        mood: true,
        body: true,
        entryTags: { take: 12, select: { tag: { select: { name: true } } } },
      },
    }),
    prisma.entryAppendEvent.findMany({
      where: {
        fragment: { contains: q, mode: "insensitive" },
        entry: { userId, encryptionMode: "STANDARD" },
      },
      orderBy: { occurredAt: "desc" },
      take: 40,
      select: {
        id: true,
        fragment: true,
        entry: { select: { entryDateYmd: true } },
      },
    }),
    prisma.chatMessage.findMany({
      where: {
        content: { contains: q, mode: "insensitive" },
        thread: { entry: { userId, encryptionMode: "STANDARD" } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        content: true,
        role: true,
        thread: { select: { entry: { select: { entryDateYmd: true } } } },
      },
    }),
    prisma.googleCalendarEventCache.findMany({
      where: {
        userId,
        isCancelled: false,
        OR: gcalOr,
      },
      orderBy: { startAt: "desc" },
      take: 40,
      select: {
        id: true,
        title: true,
        location: true,
        description: true,
        startIso: true,
        calendarName: true,
        fixedCategory: true,
        eventSearchBlob: true,
      },
    }),
  ]);

  for (const e of entries) {
    add({
      key: `entry:${e.id}`,
      kind: "entry",
      entryDateYmd: e.entryDateYmd,
      calendarYmd: null,
      title: e.title,
      snippet: clip(entrySnippetBody(e)),
      href: `/entries/${e.entryDateYmd}`,
      badge: "日記",
      score: KW,
    });
  }

  for (const a of appends) {
    add({
      key: `append:${a.id}`,
      kind: "append",
      entryDateYmd: a.entry.entryDateYmd,
      calendarYmd: null,
      title: null,
      snippet: clip(a.fragment),
      href: `/entries/${a.entry.entryDateYmd}`,
      badge: "追記",
      score: KW,
    });
  }

  for (const c of chats) {
    const ymd = c.thread.entry.entryDateYmd;
    add({
      key: `chat:${c.id}`,
      kind: "chat",
      entryDateYmd: ymd,
      calendarYmd: null,
      title: c.role === "user" ? "自分のメッセージ" : "AI のメッセージ",
      snippet: clip(c.content),
      href: `/entries/${ymd}`,
      badge: "チャット",
      score: KW,
    });
  }

  for (const g of gcals) {
    const calYmd = ymdFromStartIso(g.startIso);
    const cat = categoryDisplay(g.fixedCategory);
    add({
      key: `gcal:${g.id}`,
      kind: "gcal",
      entryDateYmd: null,
      calendarYmd: calYmd,
      title: g.title,
      snippet: clip(gcalSnippetLine(g)),
      href: `/calendar/${calYmd}`,
      badge: cat ? `\u4e88\u5b9a \u00b7 ${cat}` : "\u4e88\u5b9a",
      score: KW,
    });
  }

  let semanticOk = Boolean(process.env.OPENAI_API_KEY);
  if (process.env.OPENAI_API_KEY) {
    try {
      const vecHits = await searchEmbeddings(userId, q, 32);
      for (const vh of vecHits) {
        const s = Math.min(1, Math.max(0, vh.score));
        const blended = 0.55 + s * 0.45;

        if (vh.targetType === "DAILY_ENTRY") {
          const e = await prisma.dailyEntry.findFirst({
            where: { id: vh.targetId, userId, encryptionMode: "STANDARD" },
            select: {
              id: true,
              entryDateYmd: true,
              title: true,
              body: true,
              entryTags: { take: 12, select: { tag: { select: { name: true } } } },
            },
          });
          if (e) {
            add({
              key: `entry:${e.id}`,
              kind: "vector_entry",
              entryDateYmd: e.entryDateYmd,
              calendarYmd: null,
              title: e.title,
              snippet: clip(entrySnippetBody(e)),
              href: `/entries/${e.entryDateYmd}`,
              badge: "\u65e5\u8a18 \u00b7 \u610f\u5473",
              score: blended,
            });
          }
        } else if (vh.targetType === "GCAL_EVENT") {
          const g = await prisma.googleCalendarEventCache.findFirst({
            where: { id: vh.targetId, userId },
            select: {
              id: true,
              title: true,
              location: true,
              description: true,
              startIso: true,
              isCancelled: true,
              calendarName: true,
              fixedCategory: true,
              eventSearchBlob: true,
            },
          });
          if (g && !g.isCancelled) {
            const calYmd = ymdFromStartIso(g.startIso);
            const cat = categoryDisplay(g.fixedCategory);
            add({
              key: `gcal:${g.id}`,
              kind: "vector_gcal",
              entryDateYmd: null,
              calendarYmd: calYmd,
              title: g.title,
              snippet: clip(
                gcalSnippetLine({
                  ...g,
                  eventSearchBlob: g.eventSearchBlob ?? "",
                }),
              ),
              href: `/calendar/${calYmd}`,
              badge: cat ? `\u4e88\u5b9a \u00b7 ${cat} \u00b7 \u610f\u5473` : "\u4e88\u5b9a \u00b7 \u610f\u5473",
              score: blended,
            });
          }
        } else if (vh.targetType === "CHAT_MESSAGE") {
          const c = await prisma.chatMessage.findFirst({
            where: { id: vh.targetId },
            select: {
              id: true,
              content: true,
              role: true,
              thread: { select: { entry: { select: { userId: true, entryDateYmd: true, encryptionMode: true } } } },
            },
          });
          if (
            c &&
            c.thread.entry.userId === userId &&
            c.thread.entry.encryptionMode === "STANDARD"
          ) {
            const ymd = c.thread.entry.entryDateYmd;
            add({
              key: `chat:${c.id}`,
              kind: "vector_chat",
              entryDateYmd: ymd,
              calendarYmd: null,
              title: c.role === "user" ? "自分のメッセージ" : "AI のメッセージ",
              snippet: clip(c.content),
              href: `/entries/${ymd}`,
              badge: "チャット · 意味",
              score: blended,
            });
          }
        } else if (vh.targetType === "ENTRY_APPEND") {
          const a = await prisma.entryAppendEvent.findFirst({
            where: { id: vh.targetId },
            select: {
              id: true,
              fragment: true,
              entry: { select: { userId: true, entryDateYmd: true, encryptionMode: true } },
            },
          });
          if (a && a.entry.userId === userId && a.entry.encryptionMode === "STANDARD") {
            add({
              key: `append:${a.id}`,
              kind: "vector_append",
              entryDateYmd: a.entry.entryDateYmd,
              calendarYmd: null,
              title: null,
              snippet: clip(a.fragment),
              href: `/entries/${a.entry.entryDateYmd}`,
              badge: "追記 · 意味",
              score: blended,
            });
          }
        }
      }
    } catch {
      semanticOk = false;
    }
  }

  const hits = [...hitsMap.values()].sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-6) return b.score - a.score;
    const da = a.entryDateYmd ?? a.calendarYmd ?? "";
    const db = b.entryDateYmd ?? b.calendarYmd ?? "";
    return db.localeCompare(da);
  });

  return { hits: hits.slice(0, 80), semanticOk };
}
