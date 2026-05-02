"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildCanonicalInterestPickOptionGroups,
  labelForInterestPick,
} from "@/lib/interest-taxonomy";
import { DEFAULT_OFFICIAL_URLS_BY_PICK_ID } from "@/lib/interest-official-urls-default";

type Row = { id: string; pickId: string; url: string; updatedAt: string };

type PickMode = "tree" | "manual";

export function InterestOfficialUrlsEditor() {
  const optionGroups = useMemo(() => buildCanonicalInterestPickOptionGroups(), []);
  const canonicalIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of optionGroups) {
      for (const o of g.options) s.add(o.id);
    }
    return s;
  }, [optionGroups]);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickMode, setPickMode] = useState<PickMode>("tree");
  const [treeSelection, setTreeSelection] = useState("");
  const [pickId, setPickId] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const defaultUrlHint =
    pickId.trim() && DEFAULT_OFFICIAL_URLS_BY_PICK_ID[pickId.trim()]?.[0]
      ? DEFAULT_OFFICIAL_URLS_BY_PICK_ID[pickId.trim()][0]
      : null;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/interest-official-urls", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { items?: Row[]; error?: string };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "読み込みに失敗しました");
        return;
      }
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      setError("読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function onTreeChange(value: string) {
    setTreeSelection(value);
    setPickId(value);
    if (value) {
      const d = DEFAULT_OFFICIAL_URLS_BY_PICK_ID[value]?.[0];
      if (d) setUrl((u) => (u.trim() === "" ? d : u));
    }
  }

  function switchMode(mode: PickMode) {
    setPickMode(mode);
    if (mode === "manual") {
      setTreeSelection("");
    } else {
      const id = pickId.trim();
      setTreeSelection(id && canonicalIdSet.has(id) ? id : "");
    }
  }

  async function addRow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/interest-official-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickId: pickId.trim(), url: url.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "追加に失敗しました");
        return;
      }
      setPickId("");
      setUrl("");
      setTreeSelection("");
      await reload();
    } catch {
      setError("追加に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/interest-official-urls?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof json.error === "string" ? json.error : "削除に失敗しました");
        return;
      }
      await reload();
    } catch {
      setError("削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const la = labelForInterestPick(a.pickId) ?? a.pickId;
      const lb = labelForInterestPick(b.pickId) ?? b.pickId;
      return la.localeCompare(lb, "ja");
    });
  }, [items]);

  const modeBtn =
    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50";
  const modeActive = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
  const modeIdle =
    "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
      <p className="text-xs font-medium leading-snug text-zinc-800 dark:text-zinc-100">
        趣味タグと公式 URL の上書き
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        下の階層リストからタグを選ぶと <span className="font-mono text-[10px]">pickId</span>{" "}
        が自動入力されます。中央マップの既定 URL があるタグは、URL 欄に自動で入ります（必要なら書き換えてください）。
      </p>
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      {loading ? (
        <p className="mt-2 text-xs text-zinc-500">読み込み中…</p>
      ) : (
        <ul className="mt-2 max-h-48 divide-y divide-zinc-200 overflow-y-auto rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
          {sortedItems.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-400">上書き未登録（既定マップのみ）</li>
          ) : null}
          {sortedItems.map((it) => {
            const path = labelForInterestPick(it.pickId);
            return (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 px-3 py-2.5 text-xs text-zinc-800 dark:text-zinc-100"
              >
                <div className="min-w-0 flex-1">
                  {path ? (
                    <p className="font-medium leading-snug text-zinc-900 dark:text-zinc-50">{path}</p>
                  ) : null}
                  <p className="mt-0.5 font-mono text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {it.pickId}
                  </p>
                  <p className="mt-1 break-all text-[11px] leading-snug text-emerald-800 dark:text-emerald-300">
                    {it.url}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  onClick={() => void removeRow(it.id)}
                >
                  削除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`${modeBtn} ${pickMode === "tree" ? modeActive : modeIdle}`}
          onClick={() => switchMode("tree")}
        >
          タグを階層から選ぶ
        </button>
        <button
          type="button"
          className={`${modeBtn} ${pickMode === "manual" ? modeActive : modeIdle}`}
          onClick={() => switchMode("manual")}
        >
          pickId を直接入力
        </button>
      </div>

      {pickMode === "tree" ? (
        <label className="mt-3 block">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            関心タグ（大分類 › 小分類 › …）
          </span>
          <select
            value={treeSelection}
            onChange={(e) => onTreeChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            disabled={busy}
          >
            <option value="">— 選択してください —</option>
            {optionGroups.map((g) => (
              <optgroup key={g.categoryLabel} label={g.categoryLabel}>
                {g.options.map((o) => (
                  <option key={o.id} value={o.id} title={`${o.pathLabel} (${o.id})`}>
                    {o.pathLabel}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      ) : (
        <label className="mt-3 block">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">pickId（内部 ID）</span>
          <input
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="例: media:anime:isekai:t_tensura"
            disabled={busy}
          />
        </label>
      )}

      {defaultUrlHint ? (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          中央マップの既定:{" "}
          <span className="break-all font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
            {defaultUrlHint}
          </span>
        </p>
      ) : pickId.trim() ? (
        <p className="mt-2 text-[11px] text-zinc-400">この pickId に既定 URL はありません（手入力のみ）</p>
      ) : null}

      <label className="mt-3 block">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">公式 URL（https）</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          placeholder="https://…"
          disabled={busy}
        />
      </label>

      <button
        type="button"
        disabled={busy || !pickId.trim() || !url.trim()}
        onClick={() => void addRow()}
        className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 sm:w-auto"
      >
        上書きを追加
      </button>
    </div>
  );
}
