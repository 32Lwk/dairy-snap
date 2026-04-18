"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EntryActions } from "../entries/[date]/entry-actions";
import { EntryChat } from "../entries/[date]/entry-chat";
import { JournalDraftPanel } from "../entries/[date]/journal-draft-panel";

type Msg = { id: string; role: string; content: string };

export function TodayMainGrid({
  entryId,
  initialThreadId,
  initialMessages,
  latitude,
  longitude,
  weatherJson,
}: {
  entryId: string;
  initialThreadId: string | null;
  initialMessages: Msg[];
  latitude: number | null;
  longitude: number | null;
  weatherJson: unknown;
}) {
  const router = useRouter();
  const [liveThreadId, setLiveThreadId] = useState<string | null>(initialThreadId);
  const onThreadIdChange = useCallback((id: string | null) => {
    setLiveThreadId(id);
  }, []);

  useEffect(() => {
    setLiveThreadId(initialThreadId);
  }, [initialThreadId]);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 sm:gap-7 md:grid-cols-12 md:items-start md:gap-8 lg:gap-10">
      <div className="order-1 min-h-0 md:col-span-7 md:order-1 lg:col-span-7">
        <div className="md:sticky md:top-[calc(4.5rem+env(safe-area-inset-top,0px))] md:z-10 lg:sticky lg:top-[calc(4.75rem+env(safe-area-inset-top,0px))] lg:z-10">
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
      </div>
    </div>
  );
}
