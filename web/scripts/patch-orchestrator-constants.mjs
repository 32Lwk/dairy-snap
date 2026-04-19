import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "../src/server/orchestrator.ts");
let s = fs.readFileSync(p, "utf8");
const needle = `} from "@/lib/time/entry-temporal-context";

// ─── MBTI`;
if (!s.includes(needle)) {
  console.error("needle not found");
  process.exit(1);
}
const insert = `} from "@/lib/time/entry-temporal-context";

/** Opening: weather & calendar are already in the system prompt; omit tools to cut latency and contradictions. */
const OPENING_OMIT_TOOLS = new Set([
  "query_weather",
  "query_calendar_daily",
  "query_calendar_work",
  "query_calendar_social",
]);

const ORCHESTRATOR_TOOL_ROUND_MAX_TOKENS = 2048;
const ORCHESTRATOR_STREAM_MAX_TOKENS = 2048;
const DIARY_BODY_MAX_CHARS_ORCHESTRATOR = 12000;

// ─── MBTI`;
s = s.replace(needle, insert);
fs.writeFileSync(p, s);
console.log("ok");
