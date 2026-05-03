/**
 * 祝日内蔵ファクトを開口向けに短く言い換え（断定を弱める）。OpenAI 1 パス。
 */

import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getAgentSocialMiniChatFallbackModel,
  getAgentSocialMiniChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";

export async function paraphraseHolidayTriviaForOpening(params: {
  holidayNameJa: string;
  builtinFact: string;
}): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY?.trim()) return null;
  const api = getOpenAI();

  const sys =
    "You soften definitive tone for a chat opener. Output ONE short Japanese sentence (max ~90 chars). " +
    "No greeting. No markdown. Do not add new facts beyond the given line. If unsure, return the input compressed. " +
    "For 憲法記念日, do not explain enactment/条文; prefer neutral Golden Week / day-off framing only.";

  const user = `祝日名: ${params.holidayNameJa}\n内蔵文: ${params.builtinFact}`;

  try {
    const completion = await withChatModelFallback(
      getAgentSocialMiniChatModel(),
      getAgentSocialMiniChatFallbackModel(),
      (model) =>
        api.chat.completions.create({
          model,
          ...chatCompletionOutputTokenLimit(model, 120),
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
        }),
    );
    const out = completion.choices[0]?.message?.content?.trim();
    if (!out) return null;
    return out.length > 200 ? `${out.slice(0, 200)}…` : out;
  } catch {
    return null;
  }
}
