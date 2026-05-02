"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EntryActions } from "../entries/[date]/entry-actions";
import { EntryChat } from "../entries/[date]/entry-chat";
import { EntryImages } from "../entries/[date]/entry-images";
import { JournalDraftPanel } from "../entries/[date]/journal-draft-panel";
import { TODAY_MAX_LG_CHAT_PANE_HEIGHT } from "@/lib/app-header-toolbar";
import { useTodayJournalDraftControls } from "./today-journal-draft-bridge";

type Msg = { id: string; role: string; content: string; model?: string | null; sentAt?: string | null };

export function TodayMainGrid({
  entryId,
  entryDateYmd,
  chatSecurityNoticeJa,
  pendingSettingsSummaryJa,
  images,
  photosDailyQuota,
  initialThreadId,
  initialMessages,
  latitude,
  longitude,
  weatherJson,
  initialPlutchikAnalysis,
  transcriptCharCount,
  /** 既に本文があるときは AI 草案パネルを出さない（エントリ日ページと同様） */
  diaryBody = "",
}: {
  entryId: string;
  entryDateYmd: string;
  chatSecurityNoticeJa?: string | null;
  pendingSettingsSummaryJa?: string | null;
  images: { id: string; mimeType: string; byteSize: number; rotationQuarterTurns?: number; caption?: string }[];
  photosDailyQuota?: { remaining: number; dailyLimit: number; resetAt: string };
  initialThreadId: string | null;
  initialMessages: Msg[];
  latitude: number | null;
  longitude: number | null;
  weatherJson: unknown;
  initialPlutchikAnalysis: unknown | null;
  transcriptCharCount: number;
  diaryBody?: string;
}) {
  const router = useRouter();
  const [liveThreadId, setLiveThreadId] = useState<string | null>(initialThreadId);
  const {
    autoGenerateKey,
    bumpAutoGenerate,
    userUiGenerateKey,
    journalDraftPanelRefreshKey,
    bumpJournalDraftPanelRefresh,
  } = useTodayJournalDraftControls();
  const onThreadIdChange = useCallback((id: string | null) => {
    setLiveThreadId(id);
  }, []);

  useEffect(() => {
    setLiveThreadId(initialThreadId);
  }, [initialThreadId]);

  const hasSavedBody = useMemo(() => diaryBody.trim().length > 0, [diaryBody]);

  return (
    <div
      className={[
        // max-lg: チャット＝ビューポート−ヘッダー−底ナビの高さ、下に写真・天気（親スクロール）。lg+: 2 カラム。
        "mt-2 flex min-h-0 flex-col gap-3 sm:mt-2.5 sm:gap-4 md:mt-3 max-lg:shrink-0 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-6 lg:gap-8 lg:overflow-hidden",
      ].join(" ")}
    >
      <div
        className={[
          "order-1 flex min-h-0 w-full flex-col overflow-hidden lg:col-span-7 lg:h-full lg:min-h-0 lg:overflow-hidden",
          TODAY_MAX_LG_CHAT_PANE_HEIGHT,
        ].join(" ")}
      >
        <div className="flex h-full min-h-0 flex-1 flex-col lg:min-h-0">
          <EntryChat
            key={`${entryId}-${initialThreadId ?? "new"}-${initialMessages.length}`}
            entryId={entryId}
            threadId={initialThreadId}
            chatSecurityNoticeJa={chatSecurityNoticeJa}
            pendingSettingsSummaryJa={pendingSettingsSummaryJa}
            initialMessages={initialMessages}
            variant="default"
            layoutHeight="scrollStack"
            journalDraftPlacement="none"
            onThreadIdChange={onThreadIdChange}
            onJournalDraftGenerateRequest={bumpAutoGenerate}
            onJournalDraftContextRefresh={bumpJournalDraftPanelRefresh}
          />
        </div>
      </div>
      <div
        className={[
          "order-2 w-full shrink-0 space-y-3 sm:space-y-4 lg:col-span-5 lg:min-h-0 lg:space-y-6 lg:overflow-y-auto lg:overscroll-y-contain lg:pr-0.5",
        ].join(" ")}
      >
        {!hasSavedBody ? (
          <div className="rounded-xl border border-zinc-200 p-3 sm:p-3.5 md:p-4 dark:border-zinc-800 max-md:border-0 max-md:bg-transparent max-md:p-0">
            <JournalDraftPanel
              entryId={entryId}
              threadId={liveThreadId}
              entryDateYmd={entryDateYmd}
              images={images}
              weatherJson={weatherJson}
              autoGenerateKey={autoGenerateKey}
              userUiGenerateKey={userUiGenerateKey}
              journalDraftRefreshKey={journalDraftPanelRefreshKey}
              savedEntryBodyForPreview={diaryBody}
              onApplied={() => router.refresh()}
              variant="standalone"
              initialPlutchikAnalysis={initialPlutchikAnalysis}
              transcriptCharCount={transcriptCharCount}
              hideStandaloneChromeOnMobile
            />
          </div>
        ) : null}

        <div className="rounded-xl border border-zinc-200 p-3 sm:p-3.5 md:p-4 dark:border-zinc-800">
          <EntryImages
            key={`${entryId}-${images.length}-${images[0]?.id ?? ""}`}
            entryId={entryId}
            entryDateYmd={entryDateYmd}
            images={images}
            photosDailyQuota={photosDailyQuota}
          />
        </div>

        <EntryActions entryId={entryId} latitude={latitude} longitude={longitude} weatherJson={weatherJson} />
      </div>
    </div>
  );
}
