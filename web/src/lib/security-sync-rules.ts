/**
 * Hot-path sync tags for security review (no LLM). Keep patterns conservative for personal use.
 */

const INJECTION_SNIPPETS = [
  "ignore previous",
  "ignore all previous",
  "disregard the above",
  "system prompt",
  "developer message",
  "<|im_start|>",
  "<|im_end|>",
  "[INST]",
  "<<SYS>>",
  "override instructions",
  "jailbreak",
];

const SECRET_LIKE = /\bsk-[A-Za-z0-9]{10,}\b/;

const EXTREME_USER_LINE = 8000;

export function computeSecuritySyncRuleTags(parts: { userMessage: string; assistantContent: string }): string[] {
  const tags = new Set<string>();
  const combined = `${parts.userMessage}\n${parts.assistantContent}`.toLowerCase();

  for (const snip of INJECTION_SNIPPETS) {
    if (combined.includes(snip.toLowerCase())) {
      tags.add("injection_probe");
      break;
    }
  }

  if (SECRET_LIKE.test(parts.userMessage) || SECRET_LIKE.test(parts.assistantContent)) {
    tags.add("secret_like");
  }

  const longestUserLine = Math.max(0, ...parts.userMessage.split("\n").map((l) => l.length));
  if (longestUserLine >= EXTREME_USER_LINE) {
    tags.add("extreme_user_line");
  }

  return [...tags];
}
