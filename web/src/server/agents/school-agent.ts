import { getOpenAI } from "@/lib/ai/openai";
import { parseTimetableStored, formatTimetableForPromptDaySlice } from "@/lib/timetable";
import { parseUserSettings } from "@/lib/user-settings";
import { prisma } from "@/server/db";
import type { AgentRequest, AgentResponse } from "./types";
import { loadAgentPrompt } from "./utils";

export async function runSchoolAgent(req: AgentRequest): Promise<AgentResponse> {
  const userRow = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { settings: true },
  });
  const profile = parseUserSettings(userRow?.settings ?? {}).profile;

  const timetableSlice = profile?.studentTimetable
    ? formatTimetableForPromptDaySlice(profile.studentTimetable, req.entryDateYmd, 1200)
    : "";

  const studentNotes = profile?.studentLifeNotes ?? "";
  const memoryLines = Object.entries(req.agentMemory)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const systemPrompt = loadAgentPrompt("school");
  const contextBlock = [
    req.persona.instructions ? `## ペルソナ指示\n${req.persona.instructions}` : "",
    req.persona.mbtiHint ? `## MBTIヒント\n${req.persona.mbtiHint}` : "",
    req.longTermContext ? `## 長期記憶\n${req.longTermContext}` : "",
    timetableSlice ? `## 本日の時間割\n${timetableSlice}` : "（時間割未登録）",
    studentNotes ? `## 学校メモ\n${studentNotes}` : "",
    memoryLines ? `## ドメインメモリ\n${memoryLines}` : "",
    `## 対象日\n${req.entryDateYmd}`,
    req.userMessage ? `## ユーザーの発言\n${req.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: contextBlock },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  const hasRelevantInfo = answer.length > 0 && !answer.includes("情報なし") && !answer.includes("未登録");

  return { answer, hasRelevantInfo };
}
