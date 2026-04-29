"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { PlutchikEntryDetailMobile } from "@/components/plutchik-entry-detail-mobile";
import { parsePlutchikStoredJson } from "@/lib/emotion/plutchik";
import { EntryActions } from "./entry-actions";
import { EntryChat } from "./entry-chat";
import { EntryImages } from "./entry-images";
import { JournalDraftPanel } from "./journal-draft-panel";

type Msg = { id: string; role: string; content: string; model?: string | null };

type AppendEv = { id: string; occurredAt: string; fragment: string };

export function EntryByDateMainGrid({
  entryId,
  entryDateYmd,
  chatSecurityNoticeJa,
  initialThreadId,
  initialMessages,
  latitude,
  longitude,
  weatherJson,
  body,
  appendEvents,
  images,
  photosDailyQuota,
  dominantEmotion,
  initialPlutchikAnalysis,
  transcriptCharCount,
  journalDraftOpenPreviewSignal = 0,
  savedEntryTitle = "",
  savedEntryTagsCsv = "",
}: {
  entryId: string;
  entryDateYmd: string;
  chatSecurityNoticeJa?: string | null;
  initialThreadId: string | null;
  initialMessages: Msg[];
  latitude: number | null;
  longitude: number | null;
  weatherJson: unknown;
  body: string;
  appendEvents: AppendEv[];
  images: { id: string; mimeType: string; byteSize: number; rotationQuarterTurns?: number; caption?: string }[];
  photosDailyQuota?: { remaining: number; dailyLimit: number; resetAt: string };
  dominantEmotion: string | null;
  initialPlutchikAnalysis: unknown | null;
  transcriptCharCount: number;
  /** ヘッダー「編集」から草案プレビューを開くときに親が進める */
  journalDraftOpenPreviewSignal?: number;
  savedEntryTitle?: string;
  savedEntryTagsCsv?: string;
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

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [entryId]);

  const plutchikStored = useMemo(() => parsePlutchikStoredJson(initialPlutchikAnalysis ?? null), [initialPlutchikAnalysis]);
  const hasSavedBody = body.trim().length > 0;

  return (
    <div
      className={[
        "mt-8 grid grid-cols-1 gap-6 sm:gap-7 md:grid-cols-12 md:gap-8 lg:gap-10",
        "md:items-stretch",
        "md:h-[calc(100svh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
        "md:min-h-[22rem]",
      ].join(" ")}
    >
      <div className="order-1 min-h-0 md:col-span-7 md:order-1 md:flex md:h-full md:min-h-0 md:flex-col md:overflow-hidden lg:col-span-7">
        <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
          {hasSavedBody ? (
            <article className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">本文</h2>
              <pre className="mt-2 max-h-[min(52dvh,28rem)] overflow-y-auto overscroll-y-contain whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
                {body}
              </pre>
            </article>
          ) : null}
          <EntryChat
            key={`${entryId}-${initialThreadId ?? "new"}-${initialMessages.length}`}
            entryId={entryId}
            threadId={initialThreadId}
            chatSecurityNoticeJa={chatSecurityNoticeJa}
            initialMessages={initialMessages}
            variant="default"
            layoutHeight="fill"
            journalDraftPlacement="none"
            conversationAccordion={hasSavedBody}
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
              openPreviewSignal={journalDraftOpenPreviewSignal}
              seedTitleWhenNoDraftCache={savedEntryTitle}
              seedTagsWhenNoDraftCache={savedEntryTagsCsv}
              savedEntryBodyForPreview={body}
              showChrome
              onApplied={() => router.refresh()}
              variant="standalone"
              initialPlutchikAnalysis={initialPlutchikAnalysis}
              transcriptCharCount={transcriptCharCount}
            />
          </div>
        ) : (
          <JournalDraftPanel
            entryId={entryId}
            threadId={liveThreadId}
            entryDateYmd={entryDateYmd}
            images={images}
            weatherJson={weatherJson}
            autoGenerateKey={journalDraftAutoKey}
            journalDraftRefreshKey={journalDraftPanelRefreshKey}
            openPreviewSignal={journalDraftOpenPreviewSignal}
            seedTitleWhenNoDraftCache={savedEntryTitle}
            seedTagsWhenNoDraftCache={savedEntryTagsCsv}
            savedEntryBodyForPreview={body}
            showChrome={false}
            onApplied={() => router.refresh()}
            variant="standalone"
            initialPlutchikAnalysis={initialPlutchikAnalysis}
            transcriptCharCount={transcriptCharCount}
          />
        )}

        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <EntryImages
            key={`${entryId}-${images.length}-${images[0]?.id ?? ""}`}
            entryId={entryId}
            entryDateYmd={entryDateYmd}
            images={images}
            photosDailyQuota={photosDailyQuota}
          />
        </div>

        <EntryActions
          entryId={entryId}
          latitude={latitude}
          longitude={longitude}
          weatherJson={weatherJson}
          prependWeather={
            dominantEmotion || plutchikStored.ok ? (
              <PlutchikEntryDetailMobile
                dominantKey={dominantEmotion}
                analysis={plutchikStored.ok ? plutchikStored.data : null}
              />
            ) : null
          }
        />

        {!hasSavedBody ? (
          <article>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">本文</h2>
            <p className="mt-2 rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
              まだ本文がありません。チャットのあと、右欄の「AI 日記（草案）」から反映できます。
            </p>
          </article>
        ) : null}

        {appendEvents.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">追記履歴</h2>
            <ul className="mt-2 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
              {appendEvents.map((ev) => (
                <li key={ev.id}>
                  {ev.occurredAt} — {ev.fragment.slice(0, 80)}
                  {ev.fragment.length > 80 ? "…" : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
