import { afterEach, describe, expect, it, vi } from "vitest";
import { POLICY_VERSIONS, PROMPT_VERSIONS, resolvePolicyVersion, resolvePromptVersion } from "./prompts";

describe("resolvePromptVersion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns code default when override unset", () => {
    expect(resolvePromptVersion("reflective_chat")).toBe(PROMPT_VERSIONS.reflective_chat);
  });

  it("uses PROMPT_VERSION_OVERRIDE_REFLECTIVE_CHAT when set", () => {
    vi.stubEnv("PROMPT_VERSION_OVERRIDE_REFLECTIVE_CHAT", "rollback-1");
    expect(resolvePromptVersion("reflective_chat")).toBe("rollback-1");
  });
});

describe("resolvePolicyVersion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns code default when override unset", () => {
    expect(resolvePolicyVersion("auxiliary_default")).toBe(POLICY_VERSIONS.auxiliary_default);
  });

  it("uses POLICY_VERSION_OVERRIDE_AUXILIARY when set", () => {
    vi.stubEnv("POLICY_VERSION_OVERRIDE_AUXILIARY", "p-rollback");
    expect(resolvePolicyVersion("auxiliary_default")).toBe("p-rollback");
  });
});
