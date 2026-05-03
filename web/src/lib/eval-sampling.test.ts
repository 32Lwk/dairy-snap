import { afterEach, describe, expect, it, vi } from "vitest";
import { passesEvalSamplingGate } from "./eval-sampling";

describe("passesEvalSamplingGate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats unset rate as 1 (always pass)", () => {
    expect(passesEvalSamplingGate()).toBe(true);
  });

  it("returns false when rate is 0", () => {
    vi.stubEnv("EVAL_SAMPLE_RATE", "0");
    expect(passesEvalSamplingGate()).toBe(false);
  });

  it("returns true when rate is 1 or higher", () => {
    vi.stubEnv("EVAL_SAMPLE_RATE", "1");
    expect(passesEvalSamplingGate()).toBe(true);
    vi.stubEnv("EVAL_SAMPLE_RATE", "2");
    expect(passesEvalSamplingGate()).toBe(true);
  });
});
