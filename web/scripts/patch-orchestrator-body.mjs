import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "../src/server/orchestrator.ts");
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);

const rePersonaHdr = /\u30da\u30eb\u30bd\u30ca\u69cb\u7bc9/;
const reMemHdr = /\/\/ \u2500\u2500 \u9577\u671f\u8a18\u61b6 \u2500\u2500/;

const iUser = lines.findIndex((l) => l.includes("ユーザー設定読み込み"));
const iPersonaHdr = lines.findIndex((l) => rePersonaHdr.test(l));
if (iUser < 0 || iPersonaHdr < 0) {
  console.error("header anchors", iUser, iPersonaHdr);
  process.exit(1);
}

const headInsert = [
  "  const [userRow, longTermContext, shortTermContext, weather, calendarFetch] = await Promise.all([",
  "    prisma.user.findUnique({",
  "      where: { id: userId },",
  "      select: { settings: true },",
  "    }),",
  "    loadLongTermContext(userId),",
  "    loadShortTermContextForEntry(userId, entryId),",
  "    getWeatherContext({ userId, entryId, entryDateYmd }).catch(",
  "      (): WeatherContext => ({",
  "        dateYmd: entryDateYmd,",
  '        amLabel: "不明",',
  "        amTempC: null,",
  '        pmLabel: "不明",',
  "        pmTempC: null,",
  '        source: "none",',
  "      }),",
  "    ),",
  "    fetchCalendarEventsForDay(userId, entryDateYmd),",
  "  ]);",
  "",
  "  const profile = parseUserSettings(userRow?.settings ?? {}).profile;",
  "",
];

lines.splice(iUser, iPersonaHdr - iUser, ...headInsert);

const iMem = lines.findIndex((l) => reMemHdr.test(l));
const iCalOk = lines.findIndex((l) => l.includes("const calendarAvailable = calendarFetch.ok"));
if (iMem < 0 || iCalOk < 0 || iCalOk < iMem) {
  console.error("memory block", iMem, iCalOk);
  process.exit(1);
}

const replaceWith = [
  "",
  "  const weatherText = formatWeatherForPrompt(weather);",
  "",
  "  const calendarAvailable = calendarFetch.ok;",
  "",
];
lines.splice(iMem, iCalOk - iMem + 1, ...replaceWith);

fs.writeFileSync(p, lines.join("\n"));
console.log("orchestrator parallel fetch ok");
