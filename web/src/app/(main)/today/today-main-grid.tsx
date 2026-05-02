"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EntryActions } from "../entries/[date]/entry-actions";
import { EntryChat } from "../entries/[date]/entry-chat";
import { EntryImages } from "../entries/[date]/entry-images";
import { JournalDraftPanel } from "../entries/[date]/journal-draft-panel";
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
        // ヘッダー直下の余白はブレークポイントごとに固定（sticky ヘッダー高に依存しない）
        "mt-2 grid min-h-[22rem] grid-cols-1 gap-3 sm:mt-2.5 sm:gap-4 md:mt-3 md:grid-cols-12 md:gap-6 lg:gap-8",
        // md+: 行高は右カラムに合わせ、左チャットも同じ高さまで伸ばしてメッセージ欄だけ内部スクロール
        "md:min-h-0 md:flex-1 md:items-stretch",
      ].join(" ")}
    >
      <div className="order-1 min-h-0 md:col-span-7 md:order-1 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden lg:col-span-7">
        <div className="flex min-h-0 flex-1 flex-col md:min-h-0">
          <EntryChat
            key={`${entryId}-${initialThreadId ?? "new"}-${initialMessages.length}`}
            entryId={entryId}
            threadId={initialThreadId}
            chatSecurityNoticeJa={chatSecurityNoticeJa}
            pendingSettingsSummaryJa={pendingSettingsSummaryJa}
            initialMessages={initialMessages}
            variant="default"
            layoutHeight="fill"
            journalDraftPlacement="none"
            onThreadIdChange={onThreadIdChange}
            onJournalDraftGenerateRequest={bumpAutoGenerate}
            onJournalDraftContextRefresh={bumpJournalDraftPanelRefresh}
          />
        </div>
      </div>
      <div
        className={[
          "order-2 space-y-3 sm:space-y-4 md:col-span-5 md:order-2 md:min-h-0 md:space-y-5 md:overflow-y-auto md:overscroll-y-contain md:pr-0.5 lg:col-span-5 lg:space-y-6",
          // ヘッダー・底ナビ・余白を控えた固定高（右欄のみスクロール）
          "md:h-[calc(100svh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
          "md:max-h-[calc(100svh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
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
