"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Hit = {
  id: string;
  entryDateYmd: string;
  title: string | null;
  mood: string | null;
  body: string;
};

export function SearchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qInit = searchParams.get("q") ?? "";
  const [q, setQ] = useState(qInit);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (query: string) => {
    const t = query.trim();
    if (!t) {
      setHits([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "検索に失敗しました");
        setHits(null);
        return;
      }
      setHits(data.entries as Hit[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (qInit) void run(qInit);
  }, [qInit, run]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/today" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← 今日
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">検索</h1>
        <span className="w-12" />
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          void run(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          placeholder="キーワード"
        />
        <button
          type="submit"
          className="min-h-12 w-full shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white sm:w-auto dark:bg-zinc-50 dark:text-zinc-900"
        >
          検索
        </button>
      </form>

      <p className="mt-2 text-xs text-zinc-500">
        E2EE の本文はサーバ検索の対象外です（標準モードのみ）。
      </p>

      {loading && <p className="mt-4 text-sm text-zinc-500">検索中…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {hits && (
        <ul className="mt-6 space-y-3">
          {hits.map((h) => (
            <li key={h.id}>
              <Link
                href={`/entries/${h.entryDateYmd}`}
                className="block rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <div className="font-medium text-zinc-900 dark:text-zinc-50">{h.entryDateYmd}</div>
                {h.title && <div className="text-sm text-zinc-600 dark:text-zinc-400">{h.title}</div>}
                <div className="mt-1 line-clamp-2 text-sm text-zinc-500">{h.body}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
