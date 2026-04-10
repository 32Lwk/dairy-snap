import fs from "node:fs";
import path from "node:path";

export function loadAgentPrompt(name: string): string {
  const file = path.join(process.cwd(), "prompts", "agents", `${name}.md`);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return `# ${name} Agent\nドメイン専任エージェントです。`;
  }
}
