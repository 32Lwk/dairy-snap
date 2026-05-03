import fs from "node:fs";
import path from "node:path";

export const PROMPT_VERSIONS = {
  reflective_chat: "v1-20260419",
  journal_composer: "v5-20260419",
  plutchik_emotion: "v1-20260420",
} as const;

/** 安全・文体・ツール許可など、プロンプトファイル以外の運用ポリシー版 */
export const POLICY_VERSIONS = {
  reflective_chat_default: "p1-20260504",
  opening_default: "p1-20260504",
  /** メタ・画像・設定パッチ等、オーケストレーター主流以外の生成 */
  auxiliary_default: "p1-20260504",
} as const;

/** ログ・Artifact・DB に載せる版文字列。環境変数があれば即時ロールバック用に上書き。 */
export function resolvePromptVersion<K extends keyof typeof PROMPT_VERSIONS>(key: K): string {
  const envName = {
    reflective_chat: "PROMPT_VERSION_OVERRIDE_REFLECTIVE_CHAT",
    journal_composer: "PROMPT_VERSION_OVERRIDE_JOURNAL_COMPOSER",
    plutchik_emotion: "PROMPT_VERSION_OVERRIDE_PLUTCHIK_EMOTION",
  }[key];
  const o = process.env[envName]?.trim();
  return o && o.length > 0 ? o : PROMPT_VERSIONS[key];
}

export function resolvePolicyVersion<K extends keyof typeof POLICY_VERSIONS>(key: K): string {
  const envName = {
    reflective_chat_default: "POLICY_VERSION_OVERRIDE_REFLECTIVE_CHAT",
    opening_default: "POLICY_VERSION_OVERRIDE_OPENING",
    auxiliary_default: "POLICY_VERSION_OVERRIDE_AUXILIARY",
  }[key];
  const o = process.env[envName]?.trim();
  return o && o.length > 0 ? o : POLICY_VERSIONS[key];
}

export function allEffectivePromptVersions(): Record<keyof typeof PROMPT_VERSIONS, string> {
  return {
    reflective_chat: resolvePromptVersion("reflective_chat"),
    journal_composer: resolvePromptVersion("journal_composer"),
    plutchik_emotion: resolvePromptVersion("plutchik_emotion"),
  };
}

export function allEffectivePolicyVersions(): Record<keyof typeof POLICY_VERSIONS, string> {
  return {
    reflective_chat_default: resolvePolicyVersion("reflective_chat_default"),
    opening_default: resolvePolicyVersion("opening_default"),
    auxiliary_default: resolvePolicyVersion("auxiliary_default"),
  };
}

export function loadPromptFile(name: string): string {
  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  return fs.readFileSync(file, "utf8");
}

/**
 * オーケストレーター用プロンプトファイル名（緊急時に env で差し替え）。
 * 例: `ORCHESTRATOR_PROMPT_FILE=orchestrator`（既定）
 */
export function getOrchestratorAgentPromptBasename(): string {
  const f = process.env.ORCHESTRATOR_PROMPT_FILE?.trim();
  if (f && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(f)) return f;
  return "orchestrator";
}
