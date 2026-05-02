import { afterEach, describe, expect, it, vi } from "vitest";
import {
  shouldApplyTopicDeepeningMode,
  userMessageSuggestsConversationStuckJa,
} from "@/lib/reflective-chat-diary-nudge-rules";
import { isTopicDeepeningClassifierEnabled } from "@/server/topic-deepening-classifier";

describe("topic deepening mode", () => {
  it("detects stuck-ish Japanese", () => {
    expect(userMessageSuggestsConversationStuckJa("何を話せばいいかわからない")).toBe(true);
    expect(userMessageSuggestsConversationStuckJa("話題が思い浮かばない")).toBe(true);
    expect(userMessageSuggestsConversationStuckJa("はい")).toBe(false);
  });

  it("applies when material is rich or turns reach threshold", () => {
    expect(
      shouldApplyTopicDeepeningMode("普通の一日だった", 2, 5, "rich"),
    ).toBe(true);
    expect(
      shouldApplyTopicDeepeningMode("普通の一日だった", 5, 5, "thin"),
    ).toBe(true);
    expect(
      shouldApplyTopicDeepeningMode("普通の一日だった", 4, 5, "thin"),
    ).toBe(false);
  });

  it("applies on stuck message even when tier empty and turns low", () => {
    expect(
      shouldApplyTopicDeepeningMode("詰まった…", 1, 7, "empty"),
    ).toBe(true);
  });
});

describe("topic deepening classifier toggle", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off when TOPIC_DEEPENING_CLASSIFIER_ENABLED=false", () => {
    vi.stubEnv("TOPIC_DEEPENING_CLASSIFIER_ENABLED", "false");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(isTopicDeepeningClassifierEnabled()).toBe(false);
  });
});
