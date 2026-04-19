import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getCalendarClassifyOpenAiFallbackModel,
  getCalendarClassifyOpenAiModel,
} from "@/lib/ai/openai-chat-models";

/** Calendar default auto-classify: Gemini first, then OpenAI chain. No profile context. */
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function geminiApiKey(): string | null {
  const k =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

function parseCategoryJson(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { category?: string };
    const cat = parsed.category;
    return typeof cat === "string" ? cat.trim() : null;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const parsed = JSON.parse(m[0]) as { category?: string };
      const cat = parsed.category;
      return typeof cat === "string" ? cat.trim() : null;
    } catch {
      return null;
    }
  }
}

export async function refineCalendarCategoryWithCheapLlm(args: {
  system: string;
  userJson: string;
}): Promise<{ category: string; provider: "gemini" | "openai" | "openai_fallback" } | null> {  const key = geminiApiKey();
  const model = process.env.GEMINI_AUTO_CLASSIFY_MODEL?.trim() || "gemini-2.5-flash";
  if (key) {
    try {
      const url = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${args.system}\n\n${args.userJson}` }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 128,
            responseMimeType: "application/json",
          },
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        const cat = parseCategoryJson(raw);
        if (cat) return { category: cat, provider: "gemini" };
      }
    } catch {
      /* try OpenAI */
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) return null;

  const primary = getCalendarClassifyOpenAiModel();
  const fallback = getCalendarClassifyOpenAiFallbackModel();

  const runOpenAI = async (mod: string, tag: "openai" | "openai_fallback") => {
    try {
      const client = getOpenAI();
      const completion = await client.chat.completions.create({
        model: mod,
        temperature: 0.1,
        ...chatCompletionOutputTokenLimit(mod, 80),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.userJson },
        ],
      });
      const raw = completion.choices[0]?.message?.content?.trim() ?? "";
      const cat = parseCategoryJson(raw);
      if (cat) return { category: cat, provider: tag } as const;
    } catch {
      /* next */
    }
    return null;
  };

  const first = await runOpenAI(primary, "openai");
  if (first) return first;
  if (fallback !== primary) {
    const second = await runOpenAI(fallback, "openai_fallback");
    if (second) return second;
  }
  return null;
}