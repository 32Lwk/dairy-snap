"use client";

import { SearchPanel } from "@/components/search-panel";

export function SearchClient() {
  return (
    <SearchPanel
      syncUrlQuery
      showPageChrome
      className="mx-auto max-w-2xl px-4 py-8"
    />
  );
}
