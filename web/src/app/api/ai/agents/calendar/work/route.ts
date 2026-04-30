import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { runCalendarWorkAgent } from "@/server/agents/calendar-work-agent";
import { loadAgentMemory } from "@/server/agents/agent-helpers";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  userId: z.string().min(1),
  entryId: z.string().min(1),
  entryDateYmd: z.string().min(1),
  userMessage: z.string().min(1),
  persona: z.object({
    addressStyle: z.string(),
    chatTone: z.string(),
    depthLevel: z.string(),
    avoidTopics: z.array(z.string()),
    instructionText: z.string(),
  }),
  mbtiHint: z.object({
    mbti: z.string().optional(),
    loveMbti: z.string().optional(),
    styleHint: z.string(),
    preferredDomains: z.array(z.string()),
  }),
  longTermContext: z.string().optional(),
  extraContext: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "入力が不正です" }, { status: 400 });

  const agentMemory = await loadAgentMemory(session.user.id, "calendar_work");
  const result = await runCalendarWorkAgent({ ...parsed.data, agentMemory, userId: session.user.id });
  return NextResponse.json(result);
}
