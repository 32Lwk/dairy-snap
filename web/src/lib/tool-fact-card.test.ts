import { describe, expect, it } from "vitest";
import {
  calendarAgentReplyToToolFactCard,
  calendarDayToToolFactCard,
  clipToolFactCards,
  digestToolFactCards,
  formatTodayReferentialFactsSection,
  schoolAgentReplyToToolFactCard,
  toolFactCardSchema,
  weatherToToolFactCard,
} from "./tool-fact-card";

describe("tool-fact-card", () => {
  it("weatherToToolFactCard maps source none to low confidence", () => {
    const c = weatherToToolFactCard({
      dateYmd: "2026-05-03",
      amLabel: "不明",
      amTempC: null,
      pmLabel: "不明",
      pmTempC: null,
      source: "none",
      narrativeHint: "x".repeat(600),
    });
    expect(c.confidence).toBe("low");
    expect(c.source).toBe("weather");
    expect(String((c.payload as { narrativeHint?: string }).narrativeHint).length).toBeLessThan(400);
  });

  it("calendarAgentReplyToToolFactCard uses other source with calendarAgent payload", () => {
    const c = calendarAgentReplyToToolFactCard("work", "2026-05-03", "バイト 18時", true);
    expect(c.source).toBe("other");
    expect(c.confidence).toBe("medium");
    expect((c.payload as { calendarAgent?: string }).calendarAgent).toBe("work");
  });

  it("schoolAgentReplyToToolFactCard sets low confidence on error", () => {
    const c = schoolAgentReplyToToolFactCard("2026-05-03", "", false, "timeout");
    expect(c.source).toBe("school");
    expect(c.confidence).toBe("low");
    expect((c.payload as { agentError?: string }).agentError).toContain("timeout");
  });

  it("calendarDayToToolFactCard uses substantive count", () => {
    const c = calendarDayToToolFactCard({
      entryDateYmd: "2026-05-03",
      calendarOk: true,
      substantiveEventCount: 2,
      summaryJa: "会議と昼食",
    });
    expect(c.source).toBe("gcal_day_summary");
    expect(c.confidence).toBe("high");
  });

  it("clipToolFactCards respects max card count", () => {
    const cards = [
      weatherToToolFactCard({
        dateYmd: "2026-05-03",
        amLabel: "晴れ",
        amTempC: 20,
        pmLabel: "晴れ",
        pmTempC: 22,
        source: "open_meteo",
      }),
      calendarDayToToolFactCard({
        entryDateYmd: "2026-05-03",
        calendarOk: true,
        substantiveEventCount: 1,
        summaryJa: "会議",
      }),
      schoolAgentReplyToToolFactCard("2026-05-03", "テスト", true),
    ];
    const clipped = clipToolFactCards(cards, 2);
    expect(clipped.length).toBe(2);
  });

  it("digestToolFactCards is stable for same cards", () => {
    const a = weatherToToolFactCard({
      dateYmd: "2026-05-03",
      amLabel: "晴れ",
      amTempC: 20,
      pmLabel: "曇り",
      pmTempC: 18,
      source: "open_meteo",
    });
    const b = calendarDayToToolFactCard({
      entryDateYmd: "2026-05-03",
      calendarOk: true,
      substantiveEventCount: 0,
      summaryJa: "",
    });
    expect(digestToolFactCards([a, b])).toBe(digestToolFactCards([a, b]));
  });

  it("formatTodayReferentialFactsSection includes json fence", () => {
    const block = formatTodayReferentialFactsSection({
      cards: [
        weatherToToolFactCard({
          dateYmd: "2026-05-03",
          amLabel: "晴れ",
          amTempC: 22,
          pmLabel: "晴れ",
          pmTempC: 24,
          source: "db_cached",
        }),
      ],
      humanNarrativeWeatherJa: "午前は晴れ",
    });
    expect(block).toContain("## 今日の参照事実（structured）");
    expect(block).toContain("```json");
    expect(block).toContain("午前は晴れ");
  });

  it("toolFactCardSchema rejects unknown source", () => {
    expect(() =>
      toolFactCardSchema.parse({
        source: "not_a_source",
        asOf: "2026-05-03",
        confidence: "high",
        payload: {},
      }),
    ).toThrow();
  });
});
