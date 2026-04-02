import type { EncryptionMode } from "@/generated/prisma/enums";
import { formatUserProfileForPrompt, parseUserSettings } from "@/lib/user-settings";
import { prisma } from "@/server/db";
import {
  fetchCalendarEventsForDay,
  fetchCalendarEventsForUser,
} from "@/server/calendar";
import fs from "node:fs";
import path from "node:path";

function loadNothingDayPrompt(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", "nothing-day.md"), "utf8");
  } catch {
    return "";
  }
}

function truncate(s: string, n: number) {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

/**
 * 振り返りチャット用の追加コンテキスト（システムプロンプトに連結）
 * 本文・会話の全文はサーバログに出さない運用を維持（ここはモデル入力のみ）
 */
export async function buildReflectiveChatContext(params: {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  encryptionMode: EncryptionMode;
  currentBody: string;
}): Promise<string> {
  const userRow = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { settings: true },
  });
  const profile = parseUserSettings(userRow?.settings ?? {}).profile;
  const profileBlock = formatUserProfileForPrompt(profile);

  const recent = await prisma.dailyEntry.findMany({
    where: {
      userId: params.userId,
      id: { not: params.entryId },
      encryptionMode: "STANDARD",
    },
    orderBy: { entryDateYmd: "desc" },
    take: 7,
    select: { entryDateYmd: true, title: true, body: true },
  });

  const recentBlock = recent
    .map(
      (e) =>
        `- ${e.entryDateYmd}${e.title ? ` 「${truncate(e.title, 40)}」` : ""}: ${truncate(e.body, 400)}`,
    )
    .join("\n");

  let dayCalBlock = "（対象日の予定なし、またはカレンダー未連携）";
  try {
    const dayCal = await fetchCalendarEventsForDay(params.userId, params.entryDateYmd);
    if (dayCal.ok && dayCal.events.length > 0) {
      dayCalBlock = dayCal.events
        .slice(0, 20)
        .map(
          (ev) =>
            `- ${ev.title} | ${ev.start}–${ev.end}${ev.location ? ` @${ev.location}` : ""}${ev.description ? ` / ${truncate(ev.description, 120)}` : ""}`,
        )
        .join("\n");
    }
  } catch {
    dayCalBlock = "（対象日の予定の取得に失敗）";
  }

  let calBlock = "（予定なし、またはカレンダー未連携）";
  try {
    const cal = await fetchCalendarEventsForUser(params.userId);
    if (cal.ok && cal.events.length > 0) {
      calBlock = cal.events
        .slice(0, 15)
        .map(
          (ev) =>
            `- ${ev.title} | ${ev.start}–${ev.end}${ev.location ? ` @${ev.location}` : ""}${ev.description ? ` / ${truncate(ev.description, 120)}` : ""}`,
        )
        .join("\n");
    }
  } catch {
    calBlock = "（予定の取得に失敗。カレンダー連携を確認してください）";
  }

  const nothingDay = loadNothingDayPrompt();

  return [
    "## 参照コンテキスト（ユーザー向けの質問・共感に使う。断定やプライバシー侵害は避ける）",
    "",
    "### ユーザープロフィール（設定で登録された任意情報）",
    profileBlock,
    "",
    "### 対象日",
    params.entryDateYmd,
    "",
    "### 当日エントリ",
    params.encryptionMode === "EXPERIMENTAL_E2EE"
      ? "本文は実験的 E2EE のためモデルに送らない。長さ・内容は推測しない。"
      : `文字数目安: ${params.currentBody.length}（空に近い場合は「何もない日」寄りの質問も可）`,
    "",
    "### 直近の他日の日記（抜粋）",
    recentBlock || "（なし）",
    "",
    "### 対象日の Google カレンダー予定（重なるイベント）",
    dayCalBlock,
    "",
    "### 今後30日の予定（参考）",
    calBlock,
    "",
    "### 質問灵感（何もない日）",
    truncate(nothingDay, 2000),
  ].join("\n");
}
