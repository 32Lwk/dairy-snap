"use client";

import { SearchPanel } from "@/components/search-panel";

export function SearchClient() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <SearchPanel
        syncUrlQuery
        showPageChrome
        className="mx-auto max-w-2xl px-4 py-8"
      />
    </div>
  );
}
