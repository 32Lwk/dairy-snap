import { prisma } from "@/server/db";
import { deleteGithubOAuthToken } from "@/server/github/token-store";

/** GitHub 連携のローカルデータをすべて削除（トークン含む） */
export async function deleteAllGithubUserData(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.gitHubDailySnapshot.deleteMany({ where: { userId } }),
    prisma.gitHubContributionDay.deleteMany({ where: { userId } }),
    prisma.gitHubConnection.deleteMany({ where: { userId } }),
  ]);
  await deleteGithubOAuthToken(userId);
}
