import type { Agent, AgentContext, AgentResult } from "@/lib/mas/types";
import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getJournalComposerChatFallbackModel,
  getJournalComposerChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallbackAndModel } from "@/lib/ai/openai-model-fallback";
import { formatJournalComposerTemporalPreamble } from "@/lib/time/entry-temporal-context";
import { loadPromptFile } from "@/server/prompts";
import type { JournalDraftMaterialTier } from "@/lib/reflective-chat-diary-nudge-rules";

export type JournalComposerInput = {
  transcript: string;
  entryDateYmd: string;
  materialTier?: JournalDraftMaterialTier;
  /** 素材が thin/empty でもサーバーが許可した生成 */
  forceInsufficient?: boolean;
};
export type JournalComposerOutput = {
  draft: string;
  model: string;
  suggestedTitle: string;
  suggestedTags: string;
};

const JSON_INSTRUCTION = [
  "## 出力形式（必須）",
  "有効な **JSON オブジェクトのみ** を返す（前後に説明文や Markdown フェンスを付けない）。キーは次の 3 つ:",
  '- `"draft_markdown"` (string): 上記テンプレに沿った Markdown 本文。文量は多めでよい（時系列・場面・会話に出た具体を落とさない）。',
  '- `"title"` (string): 120 文字以内。会話で明示された事実だけを中立・簡潔にまとめた日本語（感情ラベルや曖昧な「記念日」単独は禁止）。',
  '- `"tags"` (string[]): 日本語タグ。最大 12 個、各 48 文字以内。**エントリ日の出来事を検索できる具体語**に限定（日常・生活・感想などの汎用抽象語は禁止）。各タグの文字列は、あなたが返す **`title` または `draft_markdown`** に**連続した部分文字列として必ず現れる**こと（会話の脇話だけに出る語・別日の主題だけの語は付けない）。',
].join("\n");

function parseComposerJson(raw: string): { draft: string; title: string; tags: string } {
  const trimmed = raw.trim();
  let draft = trimmed;
  let title = "";
  let tags = "";
  try {
    const j = JSON.parse(trimmed) as {
      draft_markdown?: string;
      title?: string;
      tags?: unknown;
    };
    if (typeof j.draft_markdown === "string" && j.draft_markdown.trim()) {
      draft = j.draft_markdown.trim();
    }
    if (typeof j.title === "string") {
      title = j.title.trim().slice(0, 120);
    }
    if (Array.isArray(j.tags)) {
      const parts = j.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.slice(0, 48))
        .slice(0, 12);
      tags = parts.join("、");
    }
  } catch {
    /* 旧形式のプレーン Markdown のみ */
  }
  return { draft, title, tags };
}

/** 会話ログから日記草案（Markdown）＋タイトル・タグを JSON で生成 */
export class JournalComposerAgent implements Agent<JournalComposerInput, JournalComposerOutput> {
  readonly name = "journal-composer";

  async run(
    input: JournalComposerInput,
    _ctx: AgentContext,
  ): Promise<AgentResult<JournalComposerOutput>> {
    try {
      const system = `${loadPromptFile("journal-composer")}\n\n${JSON_INSTRUCTION}`;
      const preamble = formatJournalComposerTemporalPreamble(input.entryDateYmd);
      const thinOrEmpty =
        input.forceInsufficient === true && input.materialTier && input.materialTier !== "rich";
      const materialGuard = thinOrEmpty
        ? [
            "## 今回の生成条件（最優先で上書き）",
            input.materialTier === "empty"
              ? "**ユーザーの実質的な発言がほぼありません。** 完成した一日の日記のふりはしない。各見出しの下は一言〜三言で、「会話にユーザーの出来事がまだないため記せない」旨を正直に書く。**出来事・予定・天気・感情の具体は、ユーザー発言に逐語で根拠がある場合のみ**（無ければ「（会話では触れていません）」）。assistant やツール結果だけにあってユーザーが触れていない内容は本文に入れない。"
              : "**会話はまだ薄い**です。**ユーザー発言に明示された内容だけ**を短く整理し、足りない所は「（会話では触れていません）」と明記。カレンダー・天気・AI の挨拶にだけある情報を、ユーザーが同趣旨で言及していなければ「出来事」に書かない。",
          ].join("\n")
        : "";
      const openai = getOpenAI();
      const { result: rawOut, model } = await withChatModelFallbackAndModel(
        getJournalComposerChatModel(),
        getJournalComposerChatFallbackModel(),
        async (modelId) => {
          const completion = await openai.chat.completions.create({
            model: modelId,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: [
                  preamble,
                  ...(thinOrEmpty ? [materialGuard, ""] : []),
                  "以下は会話ログです。JSON のみを返してください。",
                  "",
                  "**本文の根拠（常に厳守）**: `draft_markdown` の事実・感情は **role: user の発言に現れた内容だけ** とする。assistant の提案・天気・予定の話題で、ユーザーが同じ事実を述べていないものは「出来事」に書かない（推測で埋めない）。",
                  "",
                  "**title の厳守**: 120 文字以内。会話に**明示された事実**（場所・店名・行為・ユーザーが使った相手の呼び方）だけを並べる。**感情の総括・評価語**（満たされた・幸せ・最高・充実 など）と、**「記念日」だけ**の曖昧タイトルは禁止。誰かを傷つけない中立表現。",
                  "",
                  "**tags の厳守**: エントリ日の出来事・場所・相手・活動を表す**具体語**のみ。各タグは返す **`title` または `draft_markdown`** に**連続した文字列として必ず現れる**こと（会話にだけあって本文・タイトルに書かない語はタグにしない）。",
                  "",
                  input.transcript,
                ].join("\n"),
              },
            ],
            ...chatCompletionOutputTokenLimit(modelId, 12_000),
          });
          return (completion.choices[0]?.message?.content ?? "").trim();
        },
      );
      const { draft, title, tags } = parseComposerJson(rawOut);
      return {
        ok: true,
        data: {
          draft,
          model,
          suggestedTitle: title,
          suggestedTags: tags,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "journal composer failed";
      return { ok: false, error: msg };
    }
  }
}
