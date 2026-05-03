import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { decryptOAuthSecretPayload, encryptOAuthSecretPayload } from "@/server/github/oauth-token-crypto";
import { GITHUB_OAUTH_PROVIDER } from "@/server/github/constants";

export type GithubStoredToken = {
  accessToken: string;
  refreshToken?: string;
  /** unix seconds */
  expiresAt?: number;
  tokenType?: string;
};

export async function saveGithubOAuthToken(
  userId: string,
  token: GithubStoredToken,
  extraMeta: Record<string, unknown> = {},
): Promise<void> {
  const json = JSON.stringify(token);
  const ciphertext = encryptOAuthSecretPayload(json);
  await prisma.oAuthToken.upsert({
    where: { userId_provider: { userId, provider: GITHUB_OAUTH_PROVIDER } },
    create: {
      userId,
      provider: GITHUB_OAUTH_PROVIDER,
      tokenCiphertext: ciphertext,
      tokenMeta: extraMeta as Prisma.InputJsonValue,
    },
    update: {
      tokenCiphertext: ciphertext,
      tokenMeta: extraMeta as Prisma.InputJsonValue,
    },
  });
}

export async function loadGithubOAuthToken(userId: string): Promise<GithubStoredToken | null> {
  const row = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider: GITHUB_OAUTH_PROVIDER } },
  });
  if (!row) return null;
  try {
    const raw = decryptOAuthSecretPayload(row.tokenCiphertext);
    const j = JSON.parse(raw) as GithubStoredToken;
    if (typeof j.accessToken !== "string" || !j.accessToken) return null;
    return j;
  } catch {
    return null;
  }
}

export async function deleteGithubOAuthToken(userId: string): Promise<void> {
  await prisma.oAuthToken.deleteMany({
    where: { userId, provider: GITHUB_OAUTH_PROVIDER },
  });
}
