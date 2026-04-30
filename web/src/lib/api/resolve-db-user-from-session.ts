import { prisma } from "@/server/db";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * JWT の user.id と DB の行が一致しない場合（開発で DB をリセットしたのに Cookie が残る等）に
 * メールで同一ユーザーを引き当てる。
 */
export async function resolveDbUserFromSession(opts: {
  sessionUserId: string;
  sessionEmail: string | null | undefined;
}) {
  const { sessionUserId, sessionEmail } = opts;
  const byId = await prisma.user.findUnique({ where: { id: sessionUserId } });
  if (byId) return byId;
  if (!sessionEmail) return null;
  return prisma.user.findUnique({ where: { email: normalizeEmail(sessionEmail) } });
}

/**
 * 設定 syncCheck 用。`settings` など巨大 JSON を読まず updatedAt のみ取得する。
 */
export async function resolveSessionUserUpdatedAt(opts: {
  sessionUserId: string;
  sessionEmail: string | null | undefined;
}): Promise<Date | null> {
  const { sessionUserId, sessionEmail } = opts;
  const byId = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { updatedAt: true },
  });
  if (byId) return byId.updatedAt;
  if (!sessionEmail) return null;
  const byEmail = await prisma.user.findUnique({
    where: { email: normalizeEmail(sessionEmail) },
    select: { updatedAt: true },
  });
  return byEmail?.updatedAt ?? null;
}
