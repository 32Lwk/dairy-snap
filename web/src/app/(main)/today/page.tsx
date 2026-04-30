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
import { APP_HEADER_TITLE_INLINE, APP_HEADER_TOOLBAR_INNER } from "@/lib/app-header-toolbar";
import { TodayJournalDraftProvider, TodayMobileJournalDraftHeaderButton } from "./today-journal-draft-bridge";
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

  const hasSavedBody = (entry.body ?? "").trim().length > 0;

  return (
    <TodayJournalDraftProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 w-full shrink-0 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-950/95">
          <div className={`${APP_HEADER_TOOLBAR_INNER} max-w-5xl lg:max-w-6xl`}>
            <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500">今日</span>
              <h1 className={APP_HEADER_TITLE_INLINE}>{ymd}</h1>
            </div>
            {!hasSavedBody ? <TodayMobileJournalDraftHeaderButton /> : null}
          </div>
        </header>

        {dayCtx.calendarYmd !== ymd ? (
          <div className="mx-auto w-full max-w-5xl px-4 pt-2 sm:px-6 lg:max-w-6xl lg:px-10">
            <p className="max-w-xl text-[11px] leading-snug text-zinc-500 sm:text-xs sm:leading-relaxed dark:text-zinc-400">
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
          </div>
        ) : null}

        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col px-4 pb-4 sm:px-6 md:max-w-5xl md:pb-5 lg:max-w-6xl lg:px-10 lg:pb-6">
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
      </div>
    </TodayJournalDraftProvider>
  );
}
