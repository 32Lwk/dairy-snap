import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";

/** ログイン中ユーザーのメール（許可リスト外でも利用可。削除確認 UI 用） */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }

  const user = await resolveDbUserFromSession({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
  });
  if (!user) {
    return NextResponse.json(
      { error: "セッションと一致するユーザーが見つかりません。再ログインしてください。" },
      { status: 401 },
    );
  }

  return NextResponse.json({ email: user.email });
}
