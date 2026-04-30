import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/require-session";
import { prisma } from "@/server/db";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import { searchEmbeddings } from "@/server/embeddings";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ error: "q を指定してください" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 503 });
  }

  try {
    const raw = await searchEmbeddings(session.user.id, q.trim(), 20);
    const enriched = await Promise.all(
      raw.map(async (h) => {
        if (h.targetType !== "DAILY_ENTRY") {
          return { ...h, entryDateYmd: null as string | null };
        }
        const entry = await prisma.dailyEntry.findFirst({
          where: { id: h.targetId, userId: session.user.id },
          select: { entryDateYmd: true },
        });
        return { ...h, entryDateYmd: entry?.entryDateYmd ?? null };
      }),
    );
    return NextResponse.json({ hits: enriched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "検索に失敗しました";
    scheduleAppLog(AppLogScope.memory, "error", "memory_search_failed", {
      userId: session.user.id,
      err: msg.slice(0, 400),
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
