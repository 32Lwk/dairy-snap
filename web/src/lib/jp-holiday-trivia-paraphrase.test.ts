import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("paraphraseHolidayTriviaForOpening", () => {
  const origKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = origKey;
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/ai/openai");
    vi.doUnmock("@/lib/ai/openai-model-fallback");
  });

  it("OPENAI_API_KEY なしは null", async () => {
    delete process.env.OPENAI_API_KEY;
    const { paraphraseHolidayTriviaForOpening } = await import("./jp-holiday-trivia-paraphrase");
    const out = await paraphraseHolidayTriviaForOpening({
      holidayNameJa: "元日",
      builtinFact: "テスト用の短文。",
    });
    expect(out).toBeNull();
  });

  it("LLM 成功時は言い換え文を返す（モック）", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.doMock("@/lib/ai/openai", () => ({
      getOpenAI: () => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: "  新年の始まりの日、とのことです。  " } }],
            }),
          },
        },
      }),
    }));
    vi.doMock("@/lib/ai/openai-model-fallback", () => ({
      withChatModelFallback: async (_primary: string, _fallback: string, fn: (m: string) => Promise<unknown>) =>
        fn("gpt-4o-mini"),
    }));
    const { paraphraseHolidayTriviaForOpening } = await import("./jp-holiday-trivia-paraphrase");
    const out = await paraphraseHolidayTriviaForOpening({
      holidayNameJa: "元日",
      builtinFact: "1月1日は元日です。",
    });
    expect(out).toBe("新年の始まりの日、とのことです。");
  });
});
