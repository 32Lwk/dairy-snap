import type { Agent, AgentContext, AgentResult } from "@/lib/mas/types";
import { getDefaultChatProvider } from "@/lib/ai/provider";
import { loadPromptFile } from "@/server/prompts";

export type JournalComposerInput = { transcript: string };
export type JournalComposerOutput = { draft: string };

/** 会話ログから日記草案（Markdown）を生成 */
export class JournalComposerAgent implements Agent<JournalComposerInput, JournalComposerOutput> {
  readonly name = "journal-composer";

  async run(
    input: JournalComposerInput,
    _ctx: AgentContext,
  ): Promise<AgentResult<JournalComposerOutput>> {
    try {
      const system = loadPromptFile("journal-composer");
      const provider = getDefaultChatProvider();
      const draft = await provider.completeChat({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `以下は会話ログです。テンプレに沿って草案を出力してください。\n\n${input.transcript}`,
          },
        ],
      });
      return { ok: true, data: { draft } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "journal composer failed";
      return { ok: false, error: msg };
    }
  }
}
