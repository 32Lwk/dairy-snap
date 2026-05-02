import { prisma } from "@/server/db";
import {
  fetchAllowlistedUrlExcerpt,
  normalizeUrlForFetch,
  sha256Hex,
} from "@/lib/safe-allowlisted-fetch";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getOrFetchCachedInterestExcerpt(params: {
  userId: string;
  pickId: string | null;
  url: string;
}): Promise<string> {
  const u = normalizeUrlForFetch(params.url);
  if (!u) return "";
  const urlNorm = u.toString();
  const urlHash = sha256Hex(urlNorm);

  const cached = await prisma.interestUrlFetchCache.findUnique({
    where: { userId_urlHash: { userId: params.userId, urlHash } },
  });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS && cached.excerpt.trim()) {
    return cached.excerpt;
  }

  const got = await fetchAllowlistedUrlExcerpt({ url: urlNorm });
  const excerpt = got.ok ? got.excerpt : "";

  await prisma.interestUrlFetchCache.upsert({
    where: { userId_urlHash: { userId: params.userId, urlHash } },
    create: {
      userId: params.userId,
      urlNorm,
      urlHash,
      pickId: params.pickId,
      httpStatus: got.status || null,
      excerpt,
    },
    update: {
      urlNorm,
      pickId: params.pickId,
      httpStatus: got.status || null,
      excerpt,
      fetchedAt: new Date(),
    },
  });

  return excerpt;
}
