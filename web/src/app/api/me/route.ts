import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";

export async function GET() {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { encryptionMode: true, email: true },
  });
  if (!user) return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });

  return NextResponse.json(user);
}
