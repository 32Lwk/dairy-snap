import fs from "node:fs";
import path from "node:path";

export const PROMPT_VERSIONS = {
  reflective_chat: "v1-20260419",
  journal_composer: "v5-20260419",
  plutchik_emotion: "v1-20260420",
} as const;

export function loadPromptFile(name: string): string {
  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  return fs.readFileSync(file, "utf8");
}
