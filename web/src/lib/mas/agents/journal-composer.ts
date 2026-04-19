import type { Agent, AgentContext, AgentResult } from "@/lib/mas/types";
import { getOpenAI } from "@/lib/ai/openai";
import { getJournalComposerChatFallbackModel, getJournalComposerChatModel } from "@/lib/ai/openai-chat-models";
import { withChatModelFallbackAndModel } from "@/lib/ai/openai-model-fallback";
import { formatJournalComposerTemporalPreamble } from "@/lib/time/entry-temporal-context";
import { loadPromptFile } from "@/server/prompts";

export type JournalComposerInput = { transcript: string; entryDateYmd: string };
export type JournalComposerOutput = { draft: string; model: string };

/** 会話ログから日記草案（Markdown）を生成 */
export class JournalComposerAgent implements Agent<JournalComposerInput, JournalComposerOutput> {
  readonly name = "journal-composer";

  async run(
    input: JournalComposerInput,
    _ctx: AgentContext,
  ): Promise<AgentResult<JournalComposerOutput>> {
    try {
      const system = loadPromptFile("journal-composer");
      const preamble = formatJournalComposerTemporalPreamble(input.entryDateYmd);
      const openai = getOpenAI();
      const { result: draft, model } = await withChatModelFallbackAndModel(
        getJournalComposerChatModel(),
        getJournalComposerChatFallbackModel(),
        async (modelId) => {
          const completion = await openai.chat.completions.create({
            model: modelId,
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: `${preamble}\u4ee5\u4e0b\u306f\u4f1a\u8a71\u30ed\u30b0\u3067\u3059\u3002\u30c6\u30f3\u30d7\u30ec\u306b\u6cbf\u3063\u3066\u8349\u6848\u3092\u51fa\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002\n\n${input.transcript}`,
              },
            ],
          });
          return (completion.choices[0]?.message?.content ?? "").trim();
        },
      );
      return { ok: true, data: { draft, model } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "journal composer failed";
      return { ok: false, error: msg };
    }
  }
}
