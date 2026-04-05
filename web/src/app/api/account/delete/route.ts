import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";
import { prisma } from "@/server/db";
import { getObjectStorage } from "@/server/storage/local";

const bodySchema = z.object({
  confirmEmail: z.string().min(3).max(320),
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * ログイン中のユーザーを DB から削除（関連データは Prisma の Cascade と手動で embedding を削除）。
 * アップロード画像は削除前に storageKey を収集し、DB 削除成功後に ObjectStorage からベストエフォートで削除する。
 * 認可リスト外ユーザーでも自分のアカウントは削除できるようにする（requireSession は使わない）。
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }

  const accountEmail = session.user.email;
  if (!accountEmail) {
    return NextResponse.json({ error: "メールアドレスが取得できません" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  if (normalizeEmail(parsed.data.confirmEmail) !== normalizeEmail(accountEmail)) {
    return NextResponse.json(
      { error: "確認用メールアドレスが、このアカウントのログイン先と一致しません" },
      { status: 400 },
    );
  }

  const resolved = await resolveDbUserFromSession({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
  });
  if (!resolved) {
    return NextResponse.json(
      { error: "セッションと一致するユーザーが見つかりません。再ログインしてください。" },
      { status: 401 },
    );
  }

  const userId = resolved.id;

  const imageRows = await prisma.image.findMany({
    where: { entry: { userId } },
    select: { storageKey: true },
  });
  const storageKeys = imageRows.map((r) => r.storageKey).filter(Boolean);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.embedding.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  } catch (e) {
    console.error("[account/delete]", e);
    return NextResponse.json({ error: "削除処理に失敗しました" }, { status: 500 });
  }

  const storage = getObjectStorage();
  await Promise.allSettled(storageKeys.map((key) => storage.delete(key)));

  return NextResponse.json({ ok: true });
}
