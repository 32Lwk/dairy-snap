"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EntryActions } from "../entries/[date]/entry-actions";
import { EntryChat } from "../entries/[date]/entry-chat";
import { EntryImages } from "../entries/[date]/entry-images";
import { JournalDraftPanel } from "../entries/[date]/journal-draft-panel";

type Msg = { id: string; role: string; content: string; model?: string | null };

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
  const [journalDraftAutoKey, setJournalDraftAutoKey] = useState(0);
  const [journalDraftPanelRefreshKey, setJournalDraftPanelRefreshKey] = useState(0);
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
        "mt-6 grid grid-cols-1 gap-6 sm:gap-7 md:grid-cols-12 md:gap-8 lg:gap-10",
        // md+: 左チャットはビューポート内に収め、右カラムだけ縦スクロール
        "md:items-stretch",
        "md:h-[calc(100svh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
        "md:min-h-[22rem]",
      ].join(" ")}
    >
      <div className="order-1 min-h-0 md:col-span-7 md:order-1 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden lg:col-span-7">
        <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
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
            onJournalDraftGenerateRequest={() => setJournalDraftAutoKey((k) => k + 1)}
            onJournalDraftContextRefresh={() => setJournalDraftPanelRefreshKey((k) => k + 1)}
          />
        </div>
      </div>
      <div className="order-2 space-y-6 md:col-span-5 md:order-2 md:min-h-0 md:overflow-y-auto md:overscroll-y-contain md:pr-0.5 lg:col-span-5">
        {!hasSavedBody ? (
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <JournalDraftPanel
              entryId={entryId}
              threadId={liveThreadId}
              entryDateYmd={entryDateYmd}
              images={images}
              weatherJson={weatherJson}
              autoGenerateKey={journalDraftAutoKey}
              journalDraftRefreshKey={journalDraftPanelRefreshKey}
              savedEntryBodyForPreview={diaryBody}
              onApplied={() => router.refresh()}
              variant="standalone"
              initialPlutchikAnalysis={initialPlutchikAnalysis}
              transcriptCharCount={transcriptCharCount}
            />
          </div>
        ) : null}

        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
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
