import type { EncryptionMode } from "@/generated/prisma/enums";
import {
  applyProfileSignalsToOpeningScores,
  type OpeningProfileSignalsInput,
} from "@/lib/calendar-opening-profile-signals";
import type { CalendarOpeningCategory, CalendarOpeningSettings } from "@/lib/user-settings";
import { openingProximityImpactMultiplier } from "@/lib/opening-proximity";
import {
  addCalendarOpeningBuiltinTextHints,
  BIRTHDAY_CALENDAR_NAME_SCORE_BOOST,
  CALENDAR_DEFAULT_CATEGORY_WEIGHT,
  formatUserProfileForPrompt,
  normalizeCalendarOpeningPriorityOrder,
  parseUserSettings,
  PARTTIME_CALENDAR_NAME_SCORE_BOOST,
  pickWinningCalendarCategory,
  resolveCalendarDefaultCategoryForScoring,
  SCHOOL_CALENDAR_NAME_SCORE_BOOST,
  suggestsBirthdayCalendarName,
  suggestsParttimeCalendarName,
  suggestsSchoolCalendarName,
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

function isOpeningTopicScoreDebug(): boolean {
  const v = process.env.OPENING_TOPIC_SCORE_DEBUG;
  return v === "1" || (typeof v === "string" && v.toLowerCase() === "true");
}

function formatOpeningScoreMap(m: Map<CalendarOpeningCategory, number>): string {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k}=${n.toFixed(2)}`)
    .join(", ");
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

export function scoreOpeningTopic(args: {
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
  /** After calendar-based scores: interest / avoid / focus (layer A). */
  profileSignals?: OpeningProfileSignalsInput | null;
  /** 指定時刻（通常クライアント寄せの壁時計）。あるとき Impact に近接係数を掛ける */
  wallNow?: Date;
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
  /** picks ソート後のイベントインデックス（開口用カレンダー行の並べ替え） */
  orderedEvIdx: number[];
} {
  const rules = args.calendarOpening?.rules ?? [];
  const priority = normalizePriorityOrder(args.calendarOpening);
  const scoreDebug = isOpeningTopicScoreDebug();

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

  if (scoreDebug) {
    console.log(
      `[opening-topic-score] start wallNow=${args.wallNow?.toISOString() ?? "(なし)"} ` +
        `events=${args.dayEvents.length} occupationRole=${JSON.stringify(args.occupationRole)} ` +
        `priority=${priority.join(">")} categoryMult=${JSON.stringify(args.calendarOpening?.categoryMultiplierById ?? {})}`,
    );
  }

  for (let i = 0; i < args.dayEvents.length; i++) {
    const ev = args.dayEvents[i]!;
    const timing = timings[i] ?? "upcoming";
    const hay = `${ev.title}\n${ev.location}\n${ev.description}\n${ev.calendarName ?? ""}`.toLowerCase();
    const scores = new Map<CalendarOpeningCategory, { score: number; reasons: string[] }>();
    const add = (cat: CalendarOpeningCategory, w: number, reason: string) => {
      const cur = scores.get(cat) ?? { score: 0, reasons: [] };
      cur.score += w;
      cur.reasons.push(reason);
      scores.set(cat, cur);
    };

    addCalendarOpeningBuiltinTextHints(hay, (cat, w) => add(cat, w, "builtin"));

    if (rb) add(rb.cat, rb.w, `role:${args.occupationRole}`);

    const calDefault = resolveCalendarDefaultCategoryForScoring(
      ev.calendarId,
      ev.calendarName,
      args.calendarOpening?.calendarCategoryById,
    );
    if (calDefault) add(calDefault, CALENDAR_DEFAULT_CATEGORY_WEIGHT, "calendar:default");

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

    if (suggestsParttimeCalendarName(ev.calendarName)) {
      add("parttime", PARTTIME_CALENDAR_NAME_SCORE_BOOST, "calendar:name");
    }
    if (suggestsBirthdayCalendarName(ev.calendarName)) {
      add("birthday", BIRTHDAY_CALENDAR_NAME_SCORE_BOOST, "calendar:name");
    }
    if (suggestsSchoolCalendarName(ev.calendarName)) {
      add("school", SCHOOL_CALENDAR_NAME_SCORE_BOOST, "calendar:name");
    }

    // 最低でも「予定がある」こと自体を other に寄せる
    add("other", 1, "base");

    const flat = new Map<CalendarOpeningCategory, number>();
    for (const [cat, v] of scores) flat.set(cat, v.score);
    applyProfileSignalsToOpeningScores(flat, args.profileSignals);
    const flatAfterProfile = scoreDebug ? new Map(flat) : flat;

    // User-controlled multipliers (impact layer): multiply per-category AFTER profile signals.
    const mult = args.calendarOpening?.categoryMultiplierById ?? {};
    for (const [cat, s] of flat) {
      const m = mult[cat];
      if (typeof m === "number" && Number.isFinite(m) && m > 0) {
        flat.set(cat, s * m);
      }
    }

    const winning = pickWinningCalendarCategory(flat, priority);
    const best = scores.get(winning);
    if (!best) continue;

    const time = hhmmTokyoFromIsoLike(ev.start);
    // pastの予定は開口に選びにくくする（ただし当日が過去予定だけの場合は許可）
    const timingPenalty = hasNonPast && timing === "past" ? -100 : 0;
    const impact = flat.get(winning) ?? best.score;
    const proxMult = args.wallNow
      ? openingProximityImpactMultiplier(args.wallNow, ev.start, ev.end, timing)
      : 1;
    let effScore = impact + timingPenalty;
    if (args.wallNow) {
      effScore *= proxMult;
    }

    if (scoreDebug) {
      const catM = mult[winning];
      const multNote =
        typeof catM === "number" && Number.isFinite(catM) && catM > 0 ? `user×${catM}` : "user×(既定1)";
      console.log(
        `[opening-topic-score] ev#${i} timing=${timing} title=${JSON.stringify(truncate(ev.title, 80))} ` +
          `win=${winning} reasons=${best.reasons.slice(0, 6).join(";")} ` +
          `afterProfile{${formatOpeningScoreMap(flatAfterProfile)}} ` +
          `afterUserMult{${formatOpeningScoreMap(flat)}} ` +
          `impact=${impact.toFixed(2)} timingPen=${timingPenalty} prox=${proxMult.toFixed(3)} ${multNote} ` +
          `effScore=${effScore.toFixed(2)}`,
      );
    }

    picks.push({
      evIdx: i,
      category: winning,
      score: effScore,
      title: ev.title,
      time,
      timing,
      reasons: best.reasons.slice(0, 4),
    });
  }

  if (picks.length === 0) {
    return { primary: null, secondary: null, confidence: "low", orderedEvIdx: [] };
  }

  picks.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    // 同点なら、pastよりupcoming/ongoing/all_dayを優先
    const rank = (t: Pick["timing"]) => (t === "past" ? 3 : t === "all_day" ? 2 : t === "ongoing" ? 1 : 0);
    const rt = rank(a.timing) - rank(b.timing);
    if (rt !== 0) return rt;
    const ap = priority.indexOf(a.category);
    const bp = priority.indexOf(b.category);
    if (ap !== bp) return ap - bp;
    const evA = args.dayEvents[a.evIdx];
    const evB = args.dayEvents[b.evIdx];
    const ta = evA ? Date.parse(evA.start) : 0;
    const tb = evB ? Date.parse(evB.start) : 0;
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.evIdx - b.evIdx;
  });

  const orderedEvIdx = picks.map((p) => p.evIdx);
  const primary = picks[0]!;
  const secondary = picks.find((p) => p.evIdx !== primary.evIdx) ?? null;

  if (scoreDebug) {
    console.log(
      `[opening-topic-score] sorted: ` +
        picks.map((p, rank) => `#${rank} ev${p.evIdx} score=${p.score.toFixed(2)} ${p.timing} ${p.category} ${truncate(p.title, 60)}`).join(" | "),
    );
    console.log(
      `[opening-topic-score] primary=${primary ? `${truncate(primary.title, 80)} (${primary.score.toFixed(2)})` : "null"} ` +
        `secondary=${secondary ? `${truncate(secondary.title, 80)} (${secondary.score.toFixed(2)})` : "null"} ` +
        `confidence=${primary.score >= 8 ? "high" : primary.score >= 3 ? "medium" : "low"}`,
    );
  }

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
    orderedEvIdx,
  };
}

/**
 * 振り返りチャット用の追加コンテキスト（システムプロンプトに連結）
 * 本文・会話の全文はサーバログに出さない運用を維持（ここはモデル入力のみ）
 *
 * 注: 現状この関数の呼び出し元はなく、本番の振り返りは `runOrchestrator` が
 * `formatOrchestratorStaticProfileBlock` 等でプロンプトを組み立てている。
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
          profileSignals: profile
            ? {
                interestPicks: profile.interestPicks,
                aiAvoidTopics: profile.aiAvoidTopics,
                aiCurrentFocus: profile.aiCurrentFocus,
              }
            : null,
          wallNow: new Date(),
        })
      : null;
  const timing = openingReco?.primary?.timing ?? null;
  const nowTokyo = params.openingVariant === "weighted" ? nowTokyoIsoMinute() : "";
  const openingRecoBlock =
    openingReco && openingReco.primary
      ? [
          "### 推奨トピック（自動・開口用）",
          "- スコアはカレンダー（予定・分類ルール）を本体とし、プロフィール（趣味・関心タグ・避けたい話題・いま関心が高いもの）で微調整しています。",
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
