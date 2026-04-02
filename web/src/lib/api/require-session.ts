import { auth } from "@/auth";
import { NextResponse } from "next/server";

export type SessionUser = { id: string; isAllowed: boolean };

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
  return { user: { id: session.user.id, isAllowed: session.user.isAllowed } };
}
