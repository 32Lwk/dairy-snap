"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JournalDraftPanel({
  entryId,
  threadId,
  onApplied,
  variant = "chat-footer",
}: {
  entryId: string;
  threadId: string | null;
  onApplied?: () => void;
  variant?: "chat-footer" | "inset" | "standalone";
}) {
  const router = useRouter();
  const refresh = onApplied ?? (() => router.refresh());
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUseThread = threadId != null && threadId.length > 0;

  async function generate() {
    if (!canUseThread) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/journal-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, threadId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "生成に失敗しました");
        return;
      }
      setDraft(typeof data.draft === "string" ? data.draft : "");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/journal-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, draftMarkdown: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "反映に失敗しました");
        return;
      }
      setDraft(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const shell =
    variant === "inset"
      ? "mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      : variant === "standalone"
        ? ""
        : "border-t border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50";

  return (
    <div className={shell}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI 日記（草案）</h3>
      <p className="mt-1 text-[11px] text-zinc-500">
        プレビュー後に本文へ反映（AI 日記セクション）。誤記録防止のため自動では書き込みません。
      </p>
      {!canUseThread && (
        <p className="mt-2 text-[11px] text-zinc-500">振り返りチャットが始まると、会話から草案を生成できます。</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        disabled={busy || !canUseThread}
        onClick={() => void generate()}
        className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
      >
        {busy ? "生成中…" : "会話から草案を生成"}
      </button>
      {draft !== null && (
        <div className="mt-3 space-y-2">
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-zinc-800 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-800">
            {draft}
          </pre>
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void approve()}
            className="w-full rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            本文へ反映（AI 日記セクション）
          </button>
        </div>
      )}
    </div>
  );
}
