import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";

export type SessionUser = {
  id: string;
  isAllowed: boolean;
  /** DB フォールバック解決用（設定 API 等） */
  email: string | null | undefined;
};

export async function requireSession(): Promise<
  { user: SessionUser } | { response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "未ログインです" }, { status: 401 }) };
  }
  if (!session.user.isAllowed) {
    return { response: NextResponse.json({ error: "利用が許可されていません" }, { status: 403 }) };
  }
  return {
    user: {
      id: session.user.id,
      isAllowed: session.user.isAllowed,
      email: session.user.email,
    },
  };
}

const SESSION_USER_NOT_FOUND = {
  error: "セッションと一致するユーザーが見つかりません。再ログインしてください。",
} as const;

/**
 * JWT の user.id が DB とずれていてもメールで解決し、Prisma 上のユーザー ID を返す。
 * 解決できない場合は 401（「ユーザーが見つかりません」相当）。
 */
export async function requireResolvedSession(): Promise<
  { userId: string } | { response: NextResponse }
> {
  const session = await requireSession();
  if ("response" in session) return session;
  const user = await resolveDbUserFromSession({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
  });
  if (!user) {
    return { response: NextResponse.json(SESSION_USER_NOT_FOUND, { status: 401 }) };
  }
  return { userId: user.id };
}
