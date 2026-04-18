import { cache } from "react";
import { prisma } from "@/server/db";

export const ENTRIES_NAV_PAGE_SIZE = 60;

export type EntryNavBrief = {
  entryDateYmd: string;
  title: string | null;
  mood: string | null;
};

/** Deduped per request — safe for layout + page both calling. */
export const getRecentEntriesForNav = cache(async (userId: string): Promise<EntryNavBrief[]> => {
  return prisma.dailyEntry.findMany({
    where: { userId },
    select: { entryDateYmd: true, title: true, mood: true },
    orderBy: { entryDateYmd: "desc" },
    take: ENTRIES_NAV_PAGE_SIZE,
  });
});
