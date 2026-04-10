import { prisma } from "@/server/db";
import { parseUserSettings } from "@/lib/user-settings";
import { formatTimetableForPromptDaySlice } from "@/lib/timetable";
import type { AgentRequest, AgentResponse } from "@/server/agents/types";
import {
  loadAgentPrompt,
  loadAgentMemory,
  saveAgentMemory,
  prependPersonaInstructions,
  buildContextBlock,
  callSubAgentLLM,
  buildErrorResponse,
} from "@/server/agents/agent-helpers";

const DOMAIN = "school";

export async function runSchoolAgent(req: AgentRequest): Promise<AgentResponse> {
  const started = Date.now();
  try {
    const userRow = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { settings: true },
    });
    const profile = parseUserSettings(userRow?.settings ?? {}).profile;

    const timetableSlice = profile?.studentTimetable
      ? formatTimetableForPromptDaySlice(profile.studentTimetable, req.entryDateYmd, 900)
      : "";

    const studentLifeNotes = profile?.studentLifeNotes?.trim() ?? "";

    const memory = await loadAgentMemory(req.userId, DOMAIN);

    const basePrompt = loadAgentPrompt("school");
    const systemPrompt = prependPersonaInstructions(basePrompt, req.persona.instructionText);

    const contextBlock = buildContextBlock({ ...req, agentMemory: memory });

    const fullUserMessage = [
      contextBlock,
      timetableSlice ? `### 本日の時間割（${req.entryDateYmd} の曜日列のみ）\n${timetableSlice}` : "",
      studentLifeNotes ? `### 学校・通学メモ\n${studentLifeNotes}` : "",
      `### オーケストレーターからの質問\n${req.extraContext?.question ?? req.userMessage}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { text, latencyMs } = await callSubAgentLLM({
      systemPrompt,
      userMessage: fullUserMessage,
      maxTokens: 400,
    });

    if (req.agentMemory !== memory) {
      await saveAgentMemory(req.userId, DOMAIN, memory);
    }

    return {
      agentName: DOMAIN,
      answer: text,
      updatedMemory: [],
      model: "gpt-4o-mini",
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return buildErrorResponse(DOMAIN, e);
  }
}
