/** 会話ログの転写に使う文字数上限（草案生成・プルチック分析で共通）。 */
export const ENTRY_CHAT_TRANSCRIPT_MAX_CHARS = 24000;

export type ChatTranscriptMessage = { role: string; content: string };

export type EntryChatTranscriptResult = {
  transcript: string;
  /** `slice` 後の転写長（LLM に渡る文字数）。 */
  charCount: number;
  messageCount: number;
};

/**
 * 日記エントリ用チャットの転写を構築する（journal-draft / plutchik で共有）。
 * メッセージは呼び出し側で件数・順序を制限すること。
 */
export function buildEntryChatTranscript(messages: ChatTranscriptMessage[]): EntryChatTranscriptResult {
  const messageCount = messages.length;
  const transcript = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, ENTRY_CHAT_TRANSCRIPT_MAX_CHARS);
  return { transcript, charCount: transcript.length, messageCount };
}
