import { NextResponse } from "next/server";
import { requireResolvedSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export async function GET() {
  const resolved = await requireResolvedSession();
  if ("response" in resolved) return resolved.response;

  const user = await prisma.user.findUnique({
    where: { id: resolved.userId },
    select: { encryptionMode: true, email: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "セッションと一致するユーザーが見つかりません。再ログインしてください。" },
      { status: 401 },
    );
  }

  return NextResponse.json(user);
}
