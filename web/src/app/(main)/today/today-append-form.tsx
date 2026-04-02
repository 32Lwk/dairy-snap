"use client";

import { enqueueAppend, flushAppendQueue, pendingCount } from "@/lib/offline/queue";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  entryDateYmd: string;
  initialBody: string;
};

export function TodayAppendForm({ entryDateYmd, initialBody }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mood, setMood] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    void pendingCount().then(setQueued);
    function onOnline() {
      void (async () => {
        const r = await flushAppendQueue();
        if (r.ok > 0) router.refresh();
        setQueued(await pendingCount());
        if (r.failed) {
          setError(`同期エラー: ${r.failed}`);
        }
      })();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueAppend({
          entryDateYmd,
          fragment: text,
          ...(mood.trim() ? { mood: mood.trim() } : {}),
        });
        setText("");
        setQueued(await pendingCount());
        return;
      }

      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDateYmd,
          fragment: text,
          ...(mood.trim() ? { mood: mood.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "保存に失敗しました");
        return;
      }
      setText("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          1行メモでもOK（追記として保存）
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          placeholder="今日のことを書く…"
        />
        <input
          type="text"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          placeholder="気分タグ（任意）"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {queued > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            オフラインキュー: {queued} 件（オンライン復帰で同期）
          </p>
        )}
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {saving ? "保存中…" : "追記を保存"}
        </button>
      </form>

      <section>
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">本文プレビュー</h2>
        <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {initialBody || "（まだ追記がありません）"}
        </pre>
      </section>
    </div>
  );
}
