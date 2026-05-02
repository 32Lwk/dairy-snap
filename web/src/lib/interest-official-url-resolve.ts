import { prisma } from "@/server/db";
import { anilistFirstAnimeSiteUrl } from "@/lib/anilist-client";
import { DEFAULT_OFFICIAL_URLS_BY_PICK_ID } from "@/lib/interest-official-urls-default";

/** pickId に対する公式 URL（ユーザー上書き → 中央マップ → AniList） */
export async function resolveOfficialUrlsForPick(params: {
  userId: string;
  pickId: string;
  workLabelJa?: string;
}): Promise<string[]> {
  const userRows = await prisma.userInterestOfficialUrl.findMany({
    where: { userId: params.userId, pickId: params.pickId },
    select: { url: true },
  });
  const fromUser = userRows.map((r) => r.url.trim()).filter(Boolean);
  const fromDefault = DEFAULT_OFFICIAL_URLS_BY_PICK_ID[params.pickId] ?? [];
  let fromAnilist: string[] = [];
  if (params.pickId.includes("media:anime") && params.workLabelJa?.trim()) {
    const site = await anilistFirstAnimeSiteUrl(params.workLabelJa);
    if (site) fromAnilist = [site];
  }
  const merged = [...fromUser, ...fromAnilist, ...fromDefault];
  return [...new Set(merged)];
}
