"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type SearchHit = {
  key: string;
  kind: string;
  entryDateYmd: string | null;
  calendarYmd: string | null;
  title: string | null;
  snippet: string;
  href: string;
  badge: string;
  score: number;
};

export type SearchPanelProps = {
  /** `/search?q=` と同期（検索ページ用） */
  syncUrlQuery?: boolean;
  /** 「← 今日」とページ見出し（検索ページ用） */
  showPageChrome?: boolean;
  className?: string;
  /** ヒットのエントリリンクを押したとき（例: カレンダー上のダイアログ） */
  onNavigateHit?: () => void;
};

export function SearchPanel({
  syncUrlQuery = false,
  showPageChrome = false,
  className = "",
  onNavigateHit,
}: SearchPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(() => (syncUrlQuery ? urlQ : ""));

  useEffect(() => {
    if (!syncUrlQuery) return;
    setQ(urlQ);
  }, [syncUrlQuery, urlQ]);

  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [semanticOk, setSemanticOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (query: string) => {
    const t = query.trim();
    if (!t) {
      setHits([]);
      setSemanticOk(null);
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
        setSemanticOk(null);
        return;
      }
      setHits(data.hits as SearchHit[]);
      setSemanticOk(Boolean(data.semanticOk));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (syncUrlQuery && urlQ) void run(urlQ);
  }, [syncUrlQuery, urlQ, run]);

  return (
    <div className={className}>
      {showPageChrome ? (
        <div className="mb-6 flex items-center justify-between">
          <Link href="/today" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            ← 今日
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">検索</h1>
          <span className="w-12" />
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
        onSubmit={(e) => {
          e.preventDefault();
          const t = q.trim();
          if (syncUrlQuery) {
            router.push(`/search?q=${encodeURIComponent(t)}`);
          }
          void run(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          placeholder={"\u30ad\u30fc\u30ef\u30fc\u30c9"}
        />
        <button
          type="submit"
          className="min-h-12 w-full shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white sm:w-auto dark:bg-zinc-50 dark:text-zinc-900"
        >
          検索
        </button>
      </form>

      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        {
          "\u65e5\u8a18\uff08\u6a19\u6e96\u30e2\u30fc\u30c9\u3001\u30bf\u30b0\u540d\uff09\u30fb\u8ffd\u8a18\u30fb\u30c1\u30e3\u30c3\u30c8\u30fbGoogle\u4e88\u5b9a\uff08\u30bf\u30a4\u30c8\u30eb\u30fb\u5834\u6240\u30fb\u8aac\u660e\u30fb\u5206\u985e\u30ab\u30c6\u30b4\u30ea\uff09\u3092\u30ad\u30fc\u30ef\u30fc\u30c9\u3068\u610f\u5473\u691c\u7d22\u3057\u307e\u3059\u3002Google\u4e88\u5b9a\u306e\u30e1\u30e2\u306fAPI\u306e\u8aac\u660e\u6b04\uff08description\uff09\u3068\u3057\u3066\u540c\u671f\u3055\u308c\u307e\u3059\uff08\u7570\u306a\u308b\u5834\u6240\u306b\u3042\u308b\u62e1\u5f35\u30d7\u30ed\u30d1\u30c6\u30a3\u306f\u672a\u5bfe\u5fdc\uff09\u3002E2EE\u30a8\u30f3\u30c8\u30ea\u306e\u30c1\u30e3\u30c3\u30c8\u306f\u5bfe\u8c61\u5916\u3067\u3059\u3002\u65e7\u540c\u671f\u30c7\u30fc\u30bf\u306f\u518d\u540c\u671f\u3067\u8aac\u660e\u6587\u304c\u66f4\u65b0\u3055\u308c\u308b\u307e\u3067\u77ed\u3044\u307e\u307e\u306e\u3053\u3068\u304c\u3042\u308a\u307e\u3059\u3002"
        }
        {semanticOk === false ? (
          <span className="mt-1 block text-amber-700 dark:text-amber-400">
            {
              "\u610f\u5473\u691c\u7d22\u306f\u73fe\u5728\u7121\u52b9\u3067\u3059\uff08API\u30ad\u30fc\u307e\u305f\u306f\u30a8\u30e9\u30fc\uff09\u3002\u30ad\u30fc\u30ef\u30fc\u30c9\u306e\u307f\u8868\u793a\u3055\u308c\u3066\u3044\u307e\u3059\u3002"
            }
          </span>
        ) : null}
      </p>

      {loading && <p className="mt-4 text-sm text-zinc-500">検索中…</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {hits && hits.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">{"\u8a72\u5f53\u304c\u3042\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002"}</p>
      ) : null}

      {hits && hits.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {hits.map((h) => {
            const dateLine = h.entryDateYmd ?? h.calendarYmd ?? "—";
            return (
              <li key={h.key}>
                <Link
                  href={h.href}
                  onClick={() => onNavigateHit?.()}
                  className="block rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {h.badge}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{dateLine}</span>
                  </div>
                  {h.title ? (
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{h.title}</div>
                  ) : null}
                  <div className="mt-1 line-clamp-3 text-sm text-zinc-500">{h.snippet}</div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
