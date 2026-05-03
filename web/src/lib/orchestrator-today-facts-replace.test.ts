import { describe, expect, it } from "vitest";
import { replaceOrchestratorTodayFactsSection } from "./orchestrator-today-facts-replace";

describe("replaceOrchestratorTodayFactsSection", () => {
  it("replaces only the today facts block before 対象日", () => {
    const full = "HEAD\n## 今日の参照事実（structured）\nOLD\n\n## 対象日\nTAIL";
    const next = "## 今日の参照事実（structured）\nNEW";
    expect(replaceOrchestratorTodayFactsSection(full, next)).toBe(
      `HEAD\n${next}\n\n## 対象日\nTAIL`,
    );
  });

  it("returns full string when marker missing", () => {
    const full = "no structured block";
    expect(replaceOrchestratorTodayFactsSection(full, "x")).toBe(full);
  });
});
