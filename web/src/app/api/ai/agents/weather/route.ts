import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalAgentApi } from "@/lib/api/internal-agent-guard";
import { requireSession } from "@/lib/api/require-session";
import { getWeatherContext, formatWeatherForPrompt } from "@/server/agents/weather-tool";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  entryId: z.string(),
  entryDateYmd: z.string(),
});

export async function POST(req: NextRequest) {
  const deny = guardInternalAgentApi(req);
  if (deny) return deny;
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "入力が不正です" }, { status: 400 });

  const ctx = await getWeatherContext({
    userId: session.user.id,
    entryId: parsed.data.entryId,
    entryDateYmd: parsed.data.entryDateYmd,
  });

  return NextResponse.json({
    weather: ctx,
    formatted: formatWeatherForPrompt(ctx),
  });
}
