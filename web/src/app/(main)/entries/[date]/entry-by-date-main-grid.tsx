"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { EntryActions } from "./entry-actions";
import { EntryChat } from "./entry-chat";
import { EntryImages } from "./entry-images";
import { JournalDraftPanel } from "./journal-draft-panel";

type Msg = { id: string; role: string; content: string; model?: string | null };

type AppendEv = { id: string; occurredAt: string; fragment: string };

export function EntryByDateMainGrid({
  entryId,
  initialThreadId,
  initialMessages,
  latitude,
  longitude,
  weatherJson,
  body,
  appendEvents,
  images,
}: {
  entryId: string;
  initialThreadId: string | null;
  initialMessages: Msg[];
  latitude: number | null;
  longitude: number | null;
  weatherJson: unknown;
  body: string;
  appendEvents: AppendEv[];
  images: { id: string; mimeType: string; byteSize: number }[];
}) {
  const router = useRouter();
  const [liveThreadId, setLiveThreadId] = useState<string | null>(initialThreadId);
  const onThreadIdChange = useCallback((id: string | null) => {
    setLiveThreadId(id);
  }, []);

  useEffect(() => {
    setLiveThreadId(initialThreadId);
  }, [initialThreadId]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [entryId]);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 sm:gap-7 md:grid-cols-12 md:items-start md:gap-8 lg:gap-10">
      <div className="order-1 min-h-0 md:col-span-7 md:order-1 lg:col-span-7">
        <div className="md:sticky md:top-4 md:z-10 lg:sticky lg:top-4 lg:z-10">
          <EntryChat
            key={`${entryId}-${initialThreadId ?? "new"}-${initialMessages.length}`}
            entryId={entryId}
            threadId={initialThreadId}
            initialMessages={initialMessages}
            variant="default"
            journalDraftPlacement="none"
            onThreadIdChange={onThreadIdChange}
          />
        </div>
      </div>
      <div className="order-2 space-y-6 md:col-span-5 md:order-2 lg:col-span-5">
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <JournalDraftPanel
            entryId={entryId}
            threadId={liveThreadId}
            onApplied={() => router.refresh()}
            variant="standalone"
          />
        </div>

        <EntryActions
          entryId={entryId}
          latitude={latitude}
          longitude={longitude}
          weatherJson={weatherJson}
        />

        <article>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">本文</h2>
          {body.trim() ? (
            <pre className="mt-2 whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
              {body}
            </pre>
          ) : (
            <p className="mt-2 rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
              まだ本文がありません。チャットのあと、上の「AI 日記（草案）」から反映できます。
            </p>
          )}
        </article>

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

        <EntryImages entryId={entryId} images={images} />
      </div>
    </div>
  );
}
