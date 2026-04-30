import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { runRomanceAgent } from "@/server/agents/romance-agent";
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

  // サーバーサイドでも avoidTopics ガードを再確認
  if (parsed.data.persona.avoidTopics.includes("romance")) {
    return NextResponse.json({ answer: "", hasRelevantInfo: false });
  }

  const agentReq: AgentRequest = {
    userId: session.user.id,
    entryId: parsed.data.entryId,
    entryDateYmd: parsed.data.entryDateYmd,
    userMessage: parsed.data.userMessage,
    persona: {
      instructions: parsed.data.persona.instructions,
      avoidTopics: parsed.data.persona.avoidTopics,
      mbti: parsed.data.persona.mbti,
      loveMbti: parsed.data.persona.loveMbti,
    },
    agentMemory: parsed.data.agentMemory,
    longTermContext: parsed.data.longTermContext,
  };

  const result = await runRomanceAgent(agentReq);
  return NextResponse.json(result);
}
