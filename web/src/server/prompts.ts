import fs from "node:fs";
import path from "node:path";

export const PROMPT_VERSIONS = {
  reflective_chat: "v1-20250402",
  journal_composer: "v1-20250402",
} as const;

export function loadPromptFile(name: string): string {
  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  return fs.readFileSync(file, "utf8");
}
