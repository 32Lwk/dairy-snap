import { getOpenAI } from "@/lib/ai/openai";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** OpenAI 以外へ差し替え可能なチャット完了（非ストリーミング） */
export interface AiChatProvider {
  completeChat(params: { model: string; messages: ChatMessage[] }): Promise<string>;
}

export class OpenAiChatProvider implements AiChatProvider {
  async completeChat(params: { model: string; messages: ChatMessage[] }): Promise<string> {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: params.model,
      messages: params.messages,
    });
    return completion.choices[0]?.message?.content ?? "";
  }
}

let defaultProvider: AiChatProvider | null = null;

export function getDefaultChatProvider(): AiChatProvider {
  if (!defaultProvider) defaultProvider = new OpenAiChatProvider();
  return defaultProvider;
}
