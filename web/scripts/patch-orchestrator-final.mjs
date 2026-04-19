import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "../src/server/orchestrator.ts");
let s = fs.readFileSync(p, "utf8");

const OPENING_GROUNDING =
  "## 開口時の根��（正確性）\\n" +
  "対象日の天気と「その日の予定（カレンダー要約）」はすでに上記に含まれています。query_weather および query_calendar_* は呼ばず、" +
  "この内容だけを根��に触れてください。足りなければ一般論や開いた�ってください。";

const repls = [
  [
    `\n\n  // ── オー��ストレーターシステムプロンプト ──\n  const baseSystem = loadAgentPrompt("orchestrator");`,
    `\n\n  const openingRecommendedForPrompt = isOpening ? openingHint.recommendedAgents.filter((a) => !OPENING_OMIT_TOOLS.has(a))
    : [];

  // ── オー��ストレーターシステムプロンプト ──
  const baseSystem = loadAgentPrompt("orchestrator");`,
  ],
  [
    `    currentBody.trim()
      ? \`## 本文（このエントリ）\\n\${currentBody.length > 3200 ? \`\${currentBody.slice(0, 3200)}…\` : currentBody}\`
      : "## 本文（このエントリ）\\n（まだありません）",
    "",
    openingCalendarBlock,
    "",
    isOpening && openingHint.openingNote
      ? \`## 開口のヒント\\n\${openingHint.openingNote}\`
      : "",
    isOpening && openingHint.recommendedAgents.length > 0
      ? \`## 推��エージェント（開口時優先）\\n\${openingHint.recommendedAgents.join(", ")}\`
      : "",`,
    `    currentBody.trim()
      ? \`## 本文（このエントリ）\\n\${
          currentBody.length > DIARY_BODY_MAX_CHARS_ORCHESTRATOR
            ? \`\${currentBody.slice(0, DIARY_BODY_MAX_CHARS_ORCHESTRATOR)}…\`
            : currentBody
        }\`
      : "## 本文（このエントリ）\\n（まだありません）",
    "",
    openingCalendarBlock,
    "",
    isOpening
      ? "${OPENING_GROUNDING}"
      : "",
    isOpening && openingHint.openingNote
      ? \`## 開口のヒント\\n\${openingHint.openingNote}\`
      : "",
    isOpening && openingRecommendedForPrompt.length > 0
      ? \`## ��助ツール候��（開口・任意）\\n\${openingRecommendedForPrompt.join(", ")}\`
      : "",`.replace("${OPENING_GROUNDING}", OPENING_GROUNDING),
  ],
  [
    `  const allowedTools = ORCHESTRATOR_TOOLS.filter((t) => {
    const name = t.function.name;
    if (name === "query_romance" && avoidTopics.includes("romance")) return false;
    if (name === "query_school" && profile?.occupationRole !== "student") return false;
    if (
      (name === "query_calendar_daily" ||
        name === "query_calendar_work" ||
        name === "query_calendar_social") &&
      !calendarAvailable
    )
      return false;
    return true;
  });

  const openai = getOpenAI();

  const { result, model: orchestratorModel } = await withChatModelFallbackAndModel(
    getOrchestratorChatModel(),
    getOrchestratorChatFallbackModel(),`,
    `  let allowedTools = ORCHESTRATOR_TOOLS.filter((t) => {
    const name = t.function.name;
    if (name === "query_romance" && avoidTopics.includes("romance")) return false;
    if (name === "query_school" && profile?.occupationRole !== "student") return false;
    if (
      (name === "query_calendar_daily" ||
        name === "query_calendar_work" ||
        name === "query_calendar_social") &&
      !calendarAvailable
    )
      return false;
    return true;
  });
  if (isOpening) {
    allowedTools = allowedTools.filter((t) => !OPENING_OMIT_TOOLS.has(t.function.name));
  }

  const openai = getOpenAI();

  const { result, model: orchestratorModel } = await withChatModelFallbackAndModel(
    isOpening ? getOrchestratorOpeningChatModel() : getOrchestratorChatModel(),
    isOpening ? getOrchestratorOpeningChatFallbackModel() : getOrchestratorChatFallbackModel(),`,
  ],
  [
    `      } else if (isOpening) {
        messages.push({ role: "user", content: "." });
      }

      // ── �ングで Tool Calling ループを回す ──
      let loopCount = 0;
      while (loopCount < 3) {
        loopCount++;

        const nonStreamRes = await openai.chat.completions.create({
          model: chatModel,
          messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          tools: allowedTools as Parameters<typeof openai.chat.completions.create>[0]["tools"],
          tool_choice: loopCount === 1 ? "auto" : "none",
          ...chatCompletionOutputTokenLimit(chatModel, 800),
        });`,
    `      } else if (isOpening) {
        messages.push({ role: "user", content: "." });
      }

      if (isOpening && allowedTools.length === 0) {
        const stream = await openai.chat.completions.create({
          model: chatModel,
          stream: true,
          messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          ...chatCompletionOutputTokenLimit(chatModel, ORCHESTRATOR_STREAM_MAX_TOKENS),
        });
        return { stream, agentsUsed: [], personaInstructions, mbtiHint };
      }

      // ── 非ストリー��ングで Tool Calling ループを回す ──
      const maxToolLoops = isOpening ? 2 : 3;
      let loopCount = 0;
      while (loopCount < maxToolLoops) {
        loopCount++;

        const nonStreamRes = await openai.chat.completions.create({
          model: chatModel,
          messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          ...(allowedTools.length > 0
            ? {
                tools: allowedTools as Parameters<typeof openai.chat.completions.create>[0]["tools"],
                tool_choice: loopCount === 1 ? ("auto" as const) : ("none" as const),
              }
            : {}),
          ...chatCompletionOutputTokenLimit(chatModel, ORCHESTRATOR_TOOL_ROUND_MAX_TOKENS),
        });`,
  ],
];

for (const [a, b] of repls) {
  if (!s.includes(a)) {
    console.error("missing:\n", a.slice(0, 120));
    process.exit(1);
  }
  s = s.replace(a, b);
}

fs.writeFileSync(p, s);
console.log("ok");
