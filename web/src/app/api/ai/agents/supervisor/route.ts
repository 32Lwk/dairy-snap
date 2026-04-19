import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalAgentApi } from "@/lib/api/internal-agent-guard";
import { requireSession } from "@/lib/api/require-session";
import { runSupervisorAgent } from "@/server/agents/supervisor-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  threadId: z.string(),
  agentsUsed: z.array(z.string()),
  recentMessages: z.array(z.object({ role: z.string(), content: z.string() })),
  personaInstructions: z.string().default(""),
  mbtiHint: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const deny = guardInternalAgentApi(req);
  if (deny) return deny;
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "入力が不正です" }, { status: 400 });

  // Fire-and-forget: 非同期で評価を実行（レスポンスは即返す）
  runSupervisorAgent({
    userId: session.user.id,
    threadId: parsed.data.threadId,
    agentsUsed: parsed.data.agentsUsed,
    recentMessages: parsed.data.recentMessages,
    personaInstructions: parsed.data.personaInstructions,
    mbtiHint: parsed.data.mbtiHint,
  }).catch(() => {});

  return NextResponse.json({ accepted: true });
}
