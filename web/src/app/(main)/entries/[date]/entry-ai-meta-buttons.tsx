"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type EntryAiMetaKind = "title" | "tags" | "daily_summary";

/**
 * タイトル・タグ・日次要約（`/api/ai/meta`）に加え、画像生成・予定確認・記憶インデックス（`EntryActions` と同じ API）。
 */
export function EntryAiMetaButtons({
  entryId,
  stackDescription,
  /** stackDescription 時に true で、狭い幅向けにボタンを縦一列・幅いっぱいに */
  stackButtons = false,
  /** stackButtons 時の列数（例: 2 で 2×2） */
  stackButtonColumns = 1,
  /** 日記草案プレビュー用: 予定確認・記憶インデックスを出さない */
  omitCalendarMemory = false,
  /** 指定時は本文の代わりに AI の根拠テキストとして送る（保存済み `entry.body` より優先） */
  contextBody,
  /** false のときタイトル生成で DB のタイトルを更新しない（草案プレビュー向け） */
  persistMetaToEntry = true,
  /** メタ API が返した `result` を親で反映（プレビューのタイトル・タグなど） */
  onMetaResult,
  /** 画像生成時に日記草案をサーバーへ渡しプロンプトに含める */
  imageContextMarkdown,
}: {
  entryId: string;
  /** 指定時は縦並びブロック（モーダル内など） */
  stackDescription?: string;
  stackButtons?: boolean;
  stackButtonColumns?: 1 | 2;
  omitCalendarMemory?: boolean;
  contextBody?: string;
  persistMetaToEntry?: boolean;
  onMetaResult?: (payload: { kind: EntryAiMetaKind; result: string }) => void;
  imageContextMarkdown?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(kind: EntryAiMetaKind) {
    setBusy(kind);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { kind, entryId };
      const ctx = contextBody?.trim();
      if (ctx) body.contextBody = ctx;
      if (!persistMetaToEntry) body.persistToEntry = false;

      const res = await fetch("/api/ai/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; result?: string };
      if (!res.ok) {
        setMsg(typeof data.error === "string" ? data.error : "失敗しました");
        return;
      }
      const result = typeof data.result === "string" ? data.result : "";
      if (result && onMetaResult) onMetaResult({ kind, result });
      setMsg("完了しました");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function genImage() {
    const draftCtx = imageContextMarkdown?.trim();
    const defaultPrompt = draftCtx
      ? "日記の内容に沿った情景を写実的に（人物は特定できないように）"
      : "今日の空気感を写真風で";
    const label = draftCtx
      ? "画像の追加指示（任意。空なら草案の内容のみで生成）"
      : "画像を生成するためのプロンプト（日本語）";
    const promptRaw = window.prompt(label, defaultPrompt);
    if (promptRaw === null) return;
    const prompt = promptRaw.trim() || defaultPrompt;
    setBusy("img");
    setMsg(null);
    try {
      const payload: Record<string, unknown> = { entryId, prompt };
      if (draftCtx) payload.journalContext = draftCtx.slice(0, 12000);

      const res = await fetch("/api/ai/image-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof data.error === "string" ? data.error : "失敗しました");
        return;
      }
      setMsg("画像を生成しました");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function indexMemory() {
    setBusy("mem");
    setMsg(null);
    try {
      const res = await fetch("/api/memory/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof data.error === "string" ? data.error : "インデックスに失敗しました");
        return;
      }
      setMsg("ベクトル検索用にインデックスしました");
    } finally {
      setBusy(null);
    }
  }

  async function loadCalendar() {
    setBusy("cal");
    setMsg(null);
    try {
      const res = await fetch("/api/calendar/events");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = typeof data.error === "string" ? data.error : "失敗しました";
        const hint = typeof data.hint === "string" ? ` ${data.hint}` : "";
        setMsg(err + hint);
        return;
      }
      const n = Array.isArray(data.events) ? data.events.length : 0;
      setMsg(`直近30日の予定（未来）: ${n} 件`);
    } finally {
      setBusy(null);
    }
  }

  const btnClass =
    "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950";
  const stackedBtnClass =
    "flex w-full min-h-9 items-center justify-center rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950";

  const row = stackButtons ? (
    <>
      <button type="button" disabled={busy !== null} onClick={() => void run("title")} className={stackedBtnClass}>
        {busy === "title" ? "…" : "タイトル生成"}
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void run("tags")} className={stackedBtnClass}>
        {busy === "tags" ? "…" : "タグ提案"}
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void run("daily_summary")} className={stackedBtnClass}>
        {busy === "daily_summary" ? "…" : "日次要約"}
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void genImage()} className={stackedBtnClass}>
        {busy === "img" ? "…" : "画像生成"}
      </button>
      {!omitCalendarMemory ? (
        <button type="button" disabled={busy !== null} onClick={() => void loadCalendar()} className={stackedBtnClass}>
          {busy === "cal" ? "…" : "予定を確認（30日）"}
        </button>
      ) : null}
      {!omitCalendarMemory ? (
        <button type="button" disabled={busy !== null} onClick={() => void indexMemory()} className={stackedBtnClass}>
          {busy === "mem" ? "…" : "記憶インデックス"}
        </button>
      ) : null}
    </>
  ) : (
    <>
      <button type="button" disabled={busy !== null} onClick={() => void run("title")} className={btnClass}>
        {busy === "title" ? "…" : "タイトル生成"}
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void run("tags")} className={btnClass}>
        {busy === "tags" ? "…" : "タグ提案"}
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void run("daily_summary")} className={btnClass}>
        {busy === "daily_summary" ? "…" : "日次要約"}
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void genImage()} className={btnClass}>
        {busy === "img" ? "…" : "画像生成"}
      </button>
      {!omitCalendarMemory ? (
        <button type="button" disabled={busy !== null} onClick={() => void loadCalendar()} className={btnClass}>
          {busy === "cal" ? "…" : "予定を確認（30日）"}
        </button>
      ) : null}
      {!omitCalendarMemory ? (
        <button type="button" disabled={busy !== null} onClick={() => void indexMemory()} className={btnClass}>
          {busy === "mem" ? "…" : "記憶インデックス"}
        </button>
      ) : null}
    </>
  );

  if (stackDescription) {
    const cols = stackButtonColumns === 2 ? 2 : 1;
    return (
      <div className="space-y-2">
        <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{stackDescription}</p>
        {msg ? <p className="text-xs text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
        <div
          className={
            stackButtons
              ? cols === 2
                ? "grid grid-cols-2 gap-1.5"
                : "flex flex-col gap-1.5"
              : "flex flex-wrap gap-2"
          }
        >
          {row}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {msg ? <p className="w-full basis-full text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
      {row}
    </div>
  );
}
