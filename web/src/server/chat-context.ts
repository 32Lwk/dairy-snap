import type { EncryptionMode } from "@/generated/prisma/enums";
import type { CalendarOpeningCategory, CalendarOpeningSettings } from "@/lib/user-settings";
import {
  formatUserProfileForPrompt,
  normalizeCalendarOpeningPriorityOrder,
  parseUserSettings,
} from "@/lib/user-settings";
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

function normalizePriorityOrder(s: CalendarOpeningSettings | undefined): CalendarOpeningCategory[] {
  return normalizeCalendarOpeningPriorityOrder(s);
}

function hhmmTokyoFromIsoLike(isoLike: string): string {
  if (!isoLike) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoLike)) return "";
  const ms = Date.parse(isoLike);
  if (!Number.isFinite(ms)) return "";
  const dt = new Date(ms);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

function nowTokyoIsoMinute(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date())
    .replace(" ", "T");
}

function eventTimingStatus(ev: { start: string; end: string }): "all_day" | "upcoming" | "ongoing" | "past" {
  // all-day: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(ev.start)) return "all_day";
  const s = Date.parse(ev.start);
  const e = Date.parse(ev.end || ev.start);
  const n = Date.now();
  if (!Number.isFinite(s)) return "upcoming";
  const endMs = Number.isFinite(e) ? e : s;
  if (n < s) return "upcoming";
  if (n > endMs) return "past";
  return "ongoing";
}

function scoreOpeningTopic(args: {
  dayEvents: {
    calendarId: string;
    calendarName: string;
    colorId: string;
    title: string;
    start: string;
    end: string;
    location: string;
    description: string;
  }[];
  occupationRole: string;
  calendarOpening: CalendarOpeningSettings | undefined;
}): {
  primary: {
    evIdx: number;
    category: CalendarOpeningCategory;
    title: string;
    time: string;
    timing: "all_day" | "upcoming" | "ongoing" | "past";
    reasons: string[];
  } | null;
  secondary: {
    evIdx: number;
    category: CalendarOpeningCategory;
    title: string;
    time: string;
    timing: "all_day" | "upcoming" | "ongoing" | "past";
    reasons: string[];
  } | null;
  confidence: "high" | "medium" | "low";
} {
  const rules = args.calendarOpening?.rules ?? [];
  const priority = normalizePriorityOrder(args.calendarOpening);

  const builtin: { cat: CalendarOpeningCategory; words: string[]; w: number }[] = [
    { cat: "job_hunt", words: ["面接", "ES", "説明会", "選考", "内定", "インターン", "面談", "リクルーター"], w: 6 },
    { cat: "parttime", words: ["バイト", "アルバイト", "シフト", "出勤", "退勤", "勤務", "レジ"], w: 6 },
    { cat: "date", words: ["デート", "記念日", "彼氏", "彼女", "交際", "告白"], w: 6 },
    { cat: "school", words: ["講義", "授業", "ゼミ", "試験", "テスト", "レポート", "課題", "発表"], w: 6 },
    { cat: "health", words: ["病院", "通院", "歯医者", "クリニック", "検診", "薬"], w: 6 },
    { cat: "family", words: ["帰省", "家族", "友達", "友人", "飲み会", "同窓会"], w: 4 },
    { cat: "hobby", words: ["ライブ", "映画", "展示", "イベント", "舞台", "フェス", "観戦", "配信"], w: 4 },
  ];

  const roleBoost: Partial<Record<string, { cat: CalendarOpeningCategory; w: number }>> = {
    student: { cat: "school", w: 3 },
    job_seeking: { cat: "job_hunt", w: 3 },
  };
  const rb = roleBoost[args.occupationRole];

  type Pick = {
    evIdx: number;
    category: CalendarOpeningCategory;
    score: number;
    title: string;
    time: string;
    timing: "all_day" | "upcoming" | "ongoing" | "past";
    reasons: string[];
  };
  const picks: Pick[] = [];
  const timings = args.dayEvents.map((ev) => eventTimingStatus(ev));
  const hasNonPast = timings.some((t) => t !== "past");

  for (let i = 0; i < args.dayEvents.length; i++) {
    const ev = args.dayEvents[i]!;
    const timing = timings[i] ?? "upcoming";
    const hay = `${ev.title}\n${ev.location}\n${ev.description}`.toLowerCase();
    const scores = new Map<CalendarOpeningCategory, { score: number; reasons: string[] }>();
    const add = (cat: CalendarOpeningCategory, w: number, reason: string) => {
      const cur = scores.get(cat) ?? { score: 0, reasons: [] };
      cur.score += w;
      cur.reasons.push(reason);
      scores.set(cat, cur);
    };

    for (const b of builtin) {
      for (const w of b.words) {
        if (hay.includes(w.toLowerCase())) add(b.cat, b.w, `kw:${w}`);
      }
    }

    if (rb) add(rb.cat, rb.w, `role:${args.occupationRole}`);

    for (const r of rules) {
      const w = typeof r.weight === "number" ? r.weight : 5;
      if (r.kind === "calendarId") {
        if (r.value && ev.calendarId === r.value) add(r.category, w, "rule:calendar");
        continue;
      }
      if (r.kind === "colorId") {
        if (r.value && ev.colorId === r.value) add(r.category, w, "rule:color");
        continue;
      }
      if (r.kind === "keyword") {
        if (r.value && ev.title.toLowerCase().includes(r.value.toLowerCase())) add(r.category, w, "rule:title");
        continue;
      }
      if (r.kind === "location") {
        if (r.value && ev.location.toLowerCase().includes(r.value.toLowerCase())) add(r.category, w, "rule:loc");
        continue;
      }
      if (r.kind === "description") {
        if (r.value && ev.description.toLowerCase().includes(r.value.toLowerCase())) add(r.category, w, "rule:desc");
        continue;
      }
    }

    // 最低でも「予定がある」こと自体を other に寄せる
    add("other", 1, "base");

    let best: { cat: CalendarOpeningCategory; score: number; reasons: string[] } | null = null;
    for (const cat of priority) {
      const s = scores.get(cat);
      if (!s) continue;
      const cur = { cat, score: s.score, reasons: s.reasons };
      if (!best) best = cur;
      else if (cur.score > best.score) best = cur;
      else if (cur.score === best.score) {
        // priority の早い方を優先（既に順序走査なので何もしない）
      }
    }
    if (!best) continue;

    const time = hhmmTokyoFromIsoLike(ev.start);
    // pastの予定は開口に選びにくくする（ただし当日が過去予定だけの場合は許可）
    const timingPenalty = hasNonPast && timing === "past" ? -100 : 0;
    picks.push({
      evIdx: i,
      category: best.cat,
      score: best.score + timingPenalty,
      title: ev.title,
      time,
      timing,
      reasons: best.reasons.slice(0, 4),
    });
  }

  if (picks.length === 0) {
    return { primary: null, secondary: null, confidence: "low" };
  }

  picks.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    // 同点なら、pastよりupcoming/ongoing/all_dayを優先
    const rank = (t: Pick["timing"]) => (t === "past" ? 3 : t === "all_day" ? 2 : t === "ongoing" ? 1 : 0);
    const rt = rank(a.timing) - rank(b.timing);
    if (rt !== 0) return rt;
    const ap = priority.indexOf(a.category);
    const bp = priority.indexOf(b.category);
    return ap - bp;
  });

  const primary = picks[0]!;
  const secondary = picks.find((p) => p.evIdx !== primary.evIdx) ?? null;

  const confidence = primary.score >= 8 ? "high" : primary.score >= 3 ? "medium" : "low";
  return {
    primary: {
      evIdx: primary.evIdx,
      category: primary.category,
      title: primary.title,
      time: primary.time,
      timing: primary.timing,
      reasons: primary.reasons,
    },
    secondary: secondary
      ? {
          evIdx: secondary.evIdx,
          category: secondary.category,
          title: secondary.title,
          time: secondary.time,
          timing: secondary.timing,
          reasons: secondary.reasons,
        }
      : null,
    confidence,
  };
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
  openingVariant?: "control" | "weighted";
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
  let dayEvents: {
    calendarId: string;
    calendarName: string;
    colorId: string;
    title: string;
    start: string;
    end: string;
    location: string;
    description: string;
  }[] = [];
  try {
    const dayCal = await fetchCalendarEventsForDay(params.userId, params.entryDateYmd);
    if (dayCal.ok && dayCal.events.length > 0) {
      dayEvents = dayCal.events;
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

  const openingReco =
    params.openingVariant === "weighted" && dayEvents.length > 0
      ? scoreOpeningTopic({
          dayEvents: dayEvents.slice(0, 8),
          occupationRole: profile?.occupationRole ?? "",
          calendarOpening: profile?.calendarOpening,
        })
      : null;
  const timing = openingReco?.primary?.timing ?? null;
  const nowTokyo = params.openingVariant === "weighted" ? nowTokyoIsoMinute() : "";
  const openingRecoBlock =
    openingReco && openingReco.primary
      ? [
          "### 推奨トピック（自動・開口用）",
          ...(nowTokyo ? [`- 現在時刻（Asia/Tokyo）: ${nowTokyo}`] : []),
          `- 優先: ${openingReco.primary.category} / 信頼度: ${openingReco.confidence} / 予定: 「${truncate(openingReco.primary.title, 60)}」${openingReco.primary.time ? ` ${openingReco.primary.time}` : ""}`,
          ...(timing ? [`- 予定の時系列: ${timing}`] : []),
          ...(timing === "past"
            ? [
                "- 重要: この予定は終了済み。開口で「準備」「これから」「楽しみに」は使わず、事後の感想・印象・学びを聞く。",
              ]
            : []),
          ...(openingReco.secondary
            ? [
                `- 次点: ${openingReco.secondary.category} / 予定: 「${truncate(openingReco.secondary.title, 60)}」${openingReco.secondary.time ? ` ${openingReco.secondary.time}` : ""} / 時系列: ${openingReco.secondary.timing}`,
              ]
            : []),
          "",
        ].join("\n")
      : "";

  return [
    "## 参照コンテキスト（ユーザー向けの質問・共感に使う。断定やプライバシー侵害は避ける）",
    "",
    "### ユーザープロフィール（設定で登録された任意情報）",
    profileBlock,
    "",
    ...(openingRecoBlock ? [openingRecoBlock] : []),
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
