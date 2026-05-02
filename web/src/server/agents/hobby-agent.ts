import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getAgentQualityChatFallbackModel,
  getAgentQualityChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";
import { fetchHobbyNewsFromProvider } from "@/lib/news-api-abstraction";
import { hobbyGroundingSnippetJa, isHobbyGroundingConfigured } from "@/lib/hobby-vertex-grounding";
import { labelForAnimeInterestPickId } from "@/lib/interest-pick-label";
import { getOrFetchCachedInterestExcerpt } from "@/lib/interest-url-fetch-cache";
import { resolveOfficialUrlsForPick } from "@/lib/interest-official-url-resolve";
import { parseUserSettings } from "@/lib/user-settings";
import { formatInterestPicksForPrompt } from "@/lib/interest-taxonomy";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";
import { tryIncrementHobbyExternalFetch } from "@/server/usage";
import { prisma } from "@/server/db";
import type { AgentRequest, AgentResponse } from "./types";
import { loadAgentPrompt } from "./utils";

export async function runHobbyAgent(req: AgentRequest): Promise<AgentResponse> {
  const userRow = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { settings: true },
  });
  const profile = parseUserSettings(userRow?.settings ?? {}).profile;

  const hobbies = profile?.hobbies?.trim() ?? "";
  const interests = profile?.interests?.trim() ?? "";
  const pickBlock = formatInterestPicksForPrompt(profile?.interestPicks);
  const memoryLines = Object.entries(req.agentMemory)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const hasAnyHobbyInfo = !!(hobbies || interests || pickBlock);

  const systemPrompt = loadAgentPrompt("hobby");
  let externalBlocks: string[] = [];

  try {
    if (hasAnyHobbyInfo || req.userMessage) {
      const interestSummary = [
        hobbies ? `趣味（自由記述）: ${hobbies}` : "",
        interests ? `関心・嗜好: ${interests}` : "",
        pickBlock ? `関心タグ: ${pickBlock.replace(/\n/g, " / ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const newsStub = await fetchHobbyNewsFromProvider({
        queryJa: interestSummary.slice(0, 400),
        userId: req.userId,
      });
      if (newsStub) {
        externalBlocks.push(
          `## ニュース API（参考）\n${newsStub.title}\n${newsStub.summaryJa}\n${newsStub.sourceUrl}`,
        );
      }

      if (isHobbyGroundingConfigured()) {
        const tryGrounding = await tryIncrementHobbyExternalFetch(req.userId);
        if (tryGrounding.allowed) {
          const g = await hobbyGroundingSnippetJa({
            interestSummary,
            entryDateYmd: req.entryDateYmd,
            userMessage: req.userMessage,
          });
          if (g) {
            const src =
              g.sourceTitles.length > 0
                ? `\n参照見出し（検索）: ${g.sourceTitles.join("、")}`
                : "";
            externalBlocks.push(
              `## 検索グラウンディング（参考・検証されていない場合あり）\n${g.textJa}${src}`,
            );
          }
        }
      }

      const picks = profile?.interestPicks ?? [];
      let fetchBudget = 2;
      for (const pickId of picks) {
        if (fetchBudget <= 0) break;
        const label = labelForAnimeInterestPickId(pickId);
        const urls = await resolveOfficialUrlsForPick({
          userId: req.userId,
          pickId,
          workLabelJa: label,
        });
        if (urls.length === 0) continue;
        const bump = await tryIncrementHobbyExternalFetch(req.userId);
        if (!bump.allowed) break;
        const url = urls[0]!;
        const excerpt = await getOrFetchCachedInterestExcerpt({
          userId: req.userId,
          pickId,
          url,
        });
        fetchBudget -= 1;
        if (excerpt.trim()) {
          externalBlocks.push(
            `## 公式・許可ドメインからの抜粋（${pickId}）\nURL: ${url}\n${excerpt.slice(0, 1800)}`,
          );
        }
      }
    }
  } catch (e) {
    scheduleAppLog(AppLogScope.hobby, "warn", "hobby_agent_external_error", {
      message: String(e).slice(0, 240),
    });
  }

  const contextBlock = [
    req.persona.instructions ? `## ペルソナ指示\n${req.persona.instructions}` : "",
    req.persona.mbtiHint ? `## MBTIヒント\n${req.persona.mbtiHint}` : "",
    req.longTermContext ? `## 長期記憶\n${req.longTermContext}` : "",
    hobbies ? `## 趣味（自由記述）\n${hobbies}` : "",
    interests ? `## 関心・嗜好\n${interests}` : "",
    pickBlock ? `## 関心タグ（選択）\n${pickBlock}` : "",
    memoryLines ? `## ドメインメモリ\n${memoryLines}` : "",
    ...externalBlocks,
    `## 対象日\n${req.entryDateYmd}`,
    req.userMessage ? `## ユーザーの発言\n${req.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!hasAnyHobbyInfo && !req.userMessage) {
    return { answer: "趣味・関心情報なし。", hasRelevantInfo: false };
  }

  try {
    const openai = getOpenAI();
    const completion = await withChatModelFallback(
      getAgentQualityChatModel(),
      getAgentQualityChatFallbackModel(),
      (model) =>
        openai.chat.completions.create({
          model,
          ...chatCompletionOutputTokenLimit(model, 400),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contextBlock },
          ],
        }),
    );

    const answer = completion.choices[0]?.message?.content?.trim() ?? "";
    return { answer, hasRelevantInfo: answer.length > 0 && hasAnyHobbyInfo };
  } catch (e) {
    scheduleAppLog(AppLogScope.hobby, "error", "hobby_agent_llm_error", {
      message: String(e).slice(0, 240),
    });
    return { answer: "趣味エージェントの応答を取得できませんでした。", hasRelevantInfo: false };
  }
}
