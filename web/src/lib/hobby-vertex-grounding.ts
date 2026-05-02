/**
 * Vertex / Enterprise Gemini + Google 検索グラウンディング（@google/genai）。
 * 環境: GOOGLE_GENAI_USE_ENTERPRISE=true, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, ADC。
 */

import { GoogleGenAI } from "@google/genai";
import { AppLogScope, scheduleAppLog } from "@/lib/server/app-log";

export type HobbyGroundingSnippet = {
  textJa: string;
  sourceTitles: string[];
};

export function isHobbyGroundingConfigured(): boolean {
  return (
    process.env.GOOGLE_GENAI_USE_ENTERPRISE === "true" &&
    Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim()) &&
    Boolean(process.env.GOOGLE_CLOUD_LOCATION?.trim())
  );
}

function enterpriseEnabled(): boolean {
  return isHobbyGroundingConfigured();
}

function createClient(): GoogleGenAI | null {
  if (!enterpriseEnabled()) return null;
  try {
    return new GoogleGenAI({});
  } catch {
    return null;
  }
}

/**
 * ユーザーの趣味・関心に沿った短い日本語要約（検索根拠付き）。失敗時は null。
 */
export async function hobbyGroundingSnippetJa(params: {
  interestSummary: string;
  entryDateYmd: string;
  userMessage?: string;
  correlationId?: string;
}): Promise<HobbyGroundingSnippet | null> {
  const ai = createClient();
  if (!ai) return null;

  const model =
    process.env.HOBBY_GROUNDING_MODEL?.trim() ||
    process.env.VERTEX_GEMINI_GROUNDING_MODEL?.trim() ||
    "gemini-2.5-flash";

  const prompt = [
    "次のユーザー趣味プロフィールに関連し、エントリ日周辺で話題になりうるニュース・公開情報を、",
    "日本語で2〜4文に要約してください。断定が難しい事実は「〜との報道」「〜という情報がある」程度に留めてください。",
    "",
    `エントリ日: ${params.entryDateYmd}`,
    "## プロフィール要約",
    params.interestSummary,
    params.userMessage ? `## ユーザーのこのターンの発言\n${params.userMessage}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const textJa = response.text?.trim() ?? "";
    if (!textJa) return null;

    const metadata = response.candidates?.[0]?.groundingMetadata as
      | { groundingChunks?: { web?: { title?: string; uri?: string } }[] }
      | undefined;
    const sourceTitles =
      metadata?.groundingChunks
        ?.map((c) => c.web?.title?.trim())
        .filter((t): t is string => Boolean(t && t.length > 0)) ?? [];

    return { textJa, sourceTitles: sourceTitles.slice(0, 8) };
  } catch (e) {
    scheduleAppLog(AppLogScope.hobby, "warn", "hobby_vertex_grounding_error", {
      message: String(e).slice(0, 200),
      correlationId: params.correlationId,
    });
    return null;
  }
}
