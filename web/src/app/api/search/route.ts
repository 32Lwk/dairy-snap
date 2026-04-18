import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { unifiedSearch } from "@/server/unified-search";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ error: "q を指定してください" }, { status: 400 });
  }

  const { hits, semanticOk } = await unifiedSearch(session.user.id, q);
  return NextResponse.json({ hits, semanticOk });
}
