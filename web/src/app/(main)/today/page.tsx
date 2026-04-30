import Link from "next/link";
import { buildEntryChatTranscript } from "@/lib/chat/build-entry-chat-transcript";
import { parseUserSettings } from "@/lib/user-settings";
import { getUserEffectiveDayContext } from "@/lib/server/user-effective-day";
import { getResolvedAuthUser } from "@/lib/server/resolved-auth-user";
import { prisma } from "@/server/db";
import { upsertDailyEntryForYmd } from "@/server/ensure-daily-entry";
import { redirect } from "next/navigation";
import { readSecurityNoticeJaFromConversationNotes } from "@/lib/chat-thread-security-notice";
import {
  formatPendingSettingsChangeSummaryJa,
  type NormalizedCalendarOpeningPatch,
} from "@/lib/settings-proposal-tool";
import { TodayMainGrid } from "./today-main-grid";

export default async function TodayPage() {
  const r = await getResolvedAuthUser();
  if (r.status === "unauthenticated") redirect("/login");
  if (r.status === "session_mismatch") redirect("/login?error=session_mismatch");

  const dayCtx = await getUserEffectiveDayContext(r.user.id);
  const ymd = dayCtx.effectiveYmd;
  const [userSettingsRow, entry] = await Promise.all([
    prisma.user.findUnique({
      where: { id: r.user.id },
      select: { settings: true },
    }),
    upsertDailyEntryForYmd(r.user.id, ymd),
  ]);

  const prof = parseUserSettings(userSettingsRow?.settings ?? {}).profile;
  if (!prof?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  const chatThread = entry?.chatThreads[0];
  const dailyLimit = 5;
  const remaining = Math.max(0, dailyLimit - (entry.images?.length ?? 0));
  const resetAtIso = dayCtx.resetAtIso;
  const chatSecurityNoticeJa = readSecurityNoticeJaFromConversationNotes(chatThread?.conversationNotes);
  const cn = (chatThread?.conversationNotes as Record<string, unknown>) ?? {};
  const pendingRaw = cn.pendingSettingsChange as Record<string, unknown> | undefined;
  let pendingSettingsSummaryJa: string | null = null;
  if (typeof cn.lastSettingsProposalSummaryJa === "string" && cn.lastSettingsProposalSummaryJa.trim()) {
    pendingSettingsSummaryJa = cn.lastSettingsProposalSummaryJa.trim();
  } else if (pendingRaw && typeof pendingRaw === "object") {
    const s = formatPendingSettingsChangeSummaryJa({
      dayBoundaryEndTime: pendingRaw.dayBoundaryEndTime as string | null | undefined,
      timeZone: pendingRaw.timeZone as string | undefined,
      calendarOpening: pendingRaw.calendarOpening as NormalizedCalendarOpeningPatch | undefined,
      profileAi: pendingRaw.profileAi as
        | { aiChatTone?: string; aiDepthLevel?: string; aiAvoidTopics?: string[] }
        | undefined,
      openStudentTimetableEditor: pendingRaw.openStudentTimetableEditor === true ? true : undefined,
      reasonJa: typeof pendingRaw.reasonJa === "string" ? pendingRaw.reasonJa : undefined,
    });
    pendingSettingsSummaryJa = s.trim() ? s : null;
  }
  const transcriptMeta = buildEntryChatTranscript(
    (chatThread?.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
  );

  return (
    <div className="mx-auto w-full px-4 pb-6 pt-[calc(4.5rem+env(safe-area-inset-top,0px))] md:max-w-5xl md:px-5 md:pt-[calc(4.75rem+env(safe-area-inset-top,0px))] lg:max-w-6xl lg:px-6">
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-5 lg:max-w-6xl lg:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">今日</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {ymd}
            </h1>
            {dayCtx.calendarYmd !== ymd ? (
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                いま開いているのは{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{ymd}</span> の振り返りです（設定どおり「まだ前日の続き」）。
                カレンダーでは今日は{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{dayCtx.calendarYmd}</span> です。
                <Link
                  href={`/entries/${dayCtx.calendarYmd}`}
                  className="ml-1.5 font-medium text-emerald-700 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  カレンダー上の「今日」のエントリを開く
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <TodayMainGrid
        entryId={entry.id}
        entryDateYmd={ymd}
        diaryBody={entry.body ?? ""}
        photosDailyQuota={{ remaining, dailyLimit, resetAt: resetAtIso }}
        chatSecurityNoticeJa={chatSecurityNoticeJa}
        pendingSettingsSummaryJa={pendingSettingsSummaryJa}
        images={(entry.images ?? []).map((i) => ({
          id: i.id,
          mimeType: i.mimeType,
          byteSize: i.byteSize,
          rotationQuarterTurns: i.rotationQuarterTurns,
          caption: i.caption,
        }))}
        initialThreadId={chatThread?.id ?? null}
        initialMessages={
          chatThread?.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            model: m.model,
          })) ?? []
        }
        latitude={entry.latitude}
        longitude={entry.longitude}
        weatherJson={entry.weatherJson}
        initialPlutchikAnalysis={entry.plutchikAnalysis}
        transcriptCharCount={transcriptMeta.charCount}
      />
    </div>
  );
}
