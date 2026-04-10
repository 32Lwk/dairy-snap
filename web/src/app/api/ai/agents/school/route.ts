import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { runSchoolAgent } from "@/server/agents/school-agent";
import type { AgentRequest } from "@/server/agents/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  entryId: z.string(),
  entryDateYmd: z.string(),
  userMessage: z.string().default(""),
  persona: z.object({
    instructions: z.string().default(""),
    avoidTopics: z.array(z.string()).default([]),
    mbti: z.string().optional(),
    loveMbti: z.string().optional(),
    mbtiHint: z.string().optional(),
    corrections: z.array(z.string()).optional(),
  }),
  agentMemory: z.record(z.string(), z.string()).default({}),
  longTermContext: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "入力が不正です" }, { status: 400 });

  const agentReq: AgentRequest = {
    userId: session.user.id,
    entryId: parsed.data.entryId,
    entryDateYmd: parsed.data.entryDateYmd,
    userMessage: parsed.data.userMessage,
    persona: parsed.data.persona,
    agentMemory: parsed.data.agentMemory,
    longTermContext: parsed.data.longTermContext,
  };

  const result = await runSchoolAgent(agentReq);
  return NextResponse.json(result);
}
