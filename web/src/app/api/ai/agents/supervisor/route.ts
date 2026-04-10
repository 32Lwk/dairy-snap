import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { runSupervisorAgent } from "@/server/agents/supervisor-agent";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  agentsUsed: z.array(z.string()),
  conversation: z.array(z.object({ role: z.string(), content: z.string() })),
  personaUsed: z.object({
    addressStyle: z.string(),
    chatTone: z.string(),
    depthLevel: z.string(),
    avoidTopics: z.array(z.string()),
    instructionText: z.string(),
  }),
  weatherUsed: z
    .object({
      summary: z.string(),
      dateYmd: z.string(),
      dataSource: z.string(),
      am: z.unknown().optional(),
      pm: z.unknown().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  void runSupervisorAgent({ ...parsed.data, userId: session.user.id, weatherUsed: parsed.data.weatherUsed as Parameters<typeof runSupervisorAgent>[0]["weatherUsed"] });

  return NextResponse.json({ ok: true });
}
