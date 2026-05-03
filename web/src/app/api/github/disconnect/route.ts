import { NextResponse } from "next/server";
import { requireResolvedSession } from "@/lib/api/require-session";
import { deleteAllGithubUserData } from "@/server/github/delete-user-data";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireResolvedSession();
  if ("response" in session) return session.response;

  await deleteAllGithubUserData(session.userId);
  return NextResponse.json({ ok: true });
}
