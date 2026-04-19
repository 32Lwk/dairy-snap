import type { Agent, AgentContext, AgentResult } from "@/lib/mas/types";
import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getPlutchikEmotionChatFallbackModel,
  getPlutchikEmotionChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallbackAndModel } from "@/lib/ai/openai-model-fallback";
import { formatJournalComposerTemporalPreamble } from "@/lib/time/entry-temporal-context";
import { PLUTCHIK_LLM_JSON_SCHEMA, parsePlutchikLlmJson, type PlutchikLlmOutput } from "@/lib/emotion/plutchik";
import { loadPromptFile } from "@/server/prompts";

export type PlutchikEmotionInput = {
  transcript: string;
  entryDateYmd: string;
};

export type PlutchikEmotionOutput = PlutchikLlmOutput & {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number | null;
};

export class PlutchikEmotionAgent implements Agent<PlutchikEmotionInput, PlutchikEmotionOutput> {
  readonly name = "plutchik-emotion";

  // AgentContext はオーケストレータ契約のため受け取る（このエージェントでは未使用）。
  async run(input: PlutchikEmotionInput, ctx: AgentContext): Promise<AgentResult<PlutchikEmotionOutput>> {
    void ctx;
    try {
      const system = [
        loadPromptFile("plutchik-emotion"),
        "",
        "応答は API が要求する JSON スキーマに従うこと。",
      ].join("\n");
      const preamble = formatJournalComposerTemporalPreamble(input.entryDateYmd);
      const openai = getOpenAI();
      const { result: completion, model } = await withChatModelFallbackAndModel(
        getPlutchikEmotionChatModel(),
        getPlutchikEmotionChatFallbackModel(),
        async (modelId) => {
          const c = await openai.chat.completions.create({
            model: modelId,
            temperature: 0,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: PLUTCHIK_LLM_JSON_SCHEMA.name,
                strict: PLUTCHIK_LLM_JSON_SCHEMA.strict,
                schema: PLUTCHIK_LLM_JSON_SCHEMA.schema as Record<string, unknown>,
              },
            },
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: [
                  preamble,
                  "",
                  "以下は会話ログ（user / assistant の発話）です。JSON スキーマに従って分析結果のみを返してください。",
                  "",
                  "**noteJa**: 不要な場合は文字列ではなく **null** を必ず返す（キーは常に存在）。",
                  "",
                  input.transcript,
                ].join("\n"),
              },
            ],
            ...chatCompletionOutputTokenLimit(modelId, 2048),
          });
          return c;
        },
      );

      const raw = (completion.choices[0]?.message?.content ?? "").trim();
      const parsed = parsePlutchikLlmJson(raw);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error };
      }

      const u = completion.usage;
      const promptTokens = u?.prompt_tokens ?? 0;
      const completionTokens = u?.completion_tokens ?? 0;
      const totalTokens = u?.total_tokens ?? null;

      return {
        ok: true,
        data: {
          ...parsed.data,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "plutchik emotion failed";
      return { ok: false, error: msg };
    }
  }
}
