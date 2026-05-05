"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { formatYmdTokyo } from "@/lib/time/tokyo";

type MemoryRowShort = {
  id: string;
  bullets: unknown;
  salience: number;
  dedupKey: string | null;
  updatedAt: string;
};

type MemoryRowLong = {
  id: string;
  bullets: unknown;
  impactScore: number;
  sourceEntryId: string | null;
  createdAt: string;
};

type AgentMem = { domain: string; memoryKey: string; memoryValue: string };

type ShortGroup = {
  entryId: string;
  entryDateYmd: string;
  encryptionMode: string;
  items: MemoryRowShort[];
};

type LongGroup = {
  key: string;
  entryDateYmd: string | null;
  entryId: string | null;
  items: MemoryRowLong[];
};

type OverviewPayload = {
  entryDates: string[];
  entries: { id: string; entryDateYmd: string; encryptionMode: string }[];
  shortTermGroups: ShortGroup[];
  longTermGroups: LongGroup[];
  agentMemory: AgentMem[];
  /** 自動バックフィルが未完了のエントリ数（2通以上かつ未実行 or メッセージ増） */
  pendingChatMemoryBackfillCount?: number;
};

function ChevronDown({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className ?? ""}
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function bulletsToText(b: unknown): string {
  if (Array.isArray(b)) return (b as string[]).join("\n");
  return "";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useAutosizeTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  { maxRows }: { maxRows: number },
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cs = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(cs.lineHeight || "0") || 16;
    const padTop = Number.parseFloat(cs.paddingTop || "0") || 0;
    const padBottom = Number.parseFloat(cs.paddingBottom || "0") || 0;
    const borderTop = Number.parseFloat(cs.borderTopWidth || "0") || 0;
    const borderBottom = Number.parseFloat(cs.borderBottomWidth || "0") || 0;
    const maxHeight = Math.ceil(lineHeight * maxRows + padTop + padBottom + borderTop + borderBottom);

    el.style.height = "0px";
    const next = clamp(el.scrollHeight, 0, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [ref, value, maxRows]);
}

function textToBullets(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function textMatches(q: string, text: string): boolean {
  if (!q) return true;
  return norm(text).includes(norm(q));
}

/** 設定画面のヒント用（正午 JST で曜日を安定算出） */
function formatEntryYmdWeekdayJa(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const dt = new Date(`${ymd}T12:00:00+09:00`);
  if (Number.isNaN(dt.getTime())) return ymd;
  const wd = new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(dt);
  return `${ymd}（${wd}）`;
}

export function SettingsMemoryPanel() {
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);
  const [reconcileFailNote, setReconcileFailNote] = useState<string | null>(null);
  const [reconcileForce, setReconcileForce] = useState(false);

  const closePanel = useCallback(() => {
    setOpen(false);
    setErr(null);
    setSearch("");
    setReconcileMsg(null);
    setReconcileFailNote(null);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/settings/memory", { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as OverviewPayload & { error?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : "読み込みに失敗しました");
        setOverview(null);
        return;
      }
      setOverview(j as OverviewPayload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadOverview();
  }, [open, loadOverview]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closePanel]);

  const q = search.trim();

  const filteredShort = useMemo(() => {
    if (!overview) return [];
    if (!q) return overview.shortTermGroups;
    return overview.shortTermGroups
      .map((g) => {
        const dateMatch = textMatches(q, g.entryDateYmd);
        const items = dateMatch
          ? g.items
          : g.items.filter((row) => textMatches(q, bulletsToText(row.bullets)));
        return { ...g, items };
      })
      .filter((g) => g.items.length > 0);
  }, [overview, q]);

  const filteredShortByMonth = useMemo(() => {
    const map = new Map<string, ShortGroup[]>();
    for (const g of filteredShort) {
      const month = /^\d{4}-\d{2}-\d{2}$/.test(g.entryDateYmd) ? g.entryDateYmd.slice(0, 7) : "不明";
      const arr = map.get(month);
      if (arr) arr.push(g);
      else map.set(month, [g]);
    }
    const months = Array.from(map.entries())
      .sort((a, b) => (a[0] === "不明" ? 1 : b[0] === "不明" ? -1 : b[0].localeCompare(a[0])))
      .map(([month, groups]) => ({
        month,
        groups: groups.slice().sort((a, b) => b.entryDateYmd.localeCompare(a.entryDateYmd)),
      }));
    return months;
  }, [filteredShort]);

  const filteredLong = useMemo(() => {
    if (!overview) return [];
    if (!q) return overview.longTermGroups;
    return overview.longTermGroups
      .map((g) => {
        const titleForSearch =
          g.key === "common"
            ? "\u5171\u901a\u7279\u5b9a\u306e\u65e5\u306b\u7d10\u3065\u304b\u306a\u3044"
            : g.entryDateYmd ?? "";
        const labelMatch = textMatches(q, titleForSearch);
        const items = labelMatch
          ? g.items
          : g.items.filter((row) => textMatches(q, bulletsToText(row.bullets)));
        return { ...g, items };
      })
      .filter((g) => g.items.length > 0);
  }, [overview, q]);

  const filteredAgent = useMemo(() => {
    if (!overview) return [];
    if (!q) return overview.agentMemory;
    return overview.agentMemory.filter(
      (a) =>
        textMatches(q, a.domain) || textMatches(q, a.memoryKey) || textMatches(q, a.memoryValue),
    );
  }, [overview, q]);

  const shortTotalCount = overview?.shortTermGroups.reduce((n, g) => n + g.items.length, 0) ?? 0;
  const longTotalCount = overview?.longTermGroups.reduce((n, g) => n + g.items.length, 0) ?? 0;

  async function patchShort(id: string, bullets: string, salience: number) {
    const res = await fetch(`/api/settings/memory/short-term/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bullets: textToBullets(bullets), salience }),
      credentials: "same-origin",
    });
    if (!res.ok) setErr("\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
    else void loadOverview();
  }

  async function delShort(id: string) {
    if (!confirm("\u3053\u306e\u77ed\u671f\u8a18\u61b6\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f")) return;
    const res = await fetch(`/api/settings/memory/short-term/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) setErr("\u524a\u9664\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
    else void loadOverview();
  }

  async function patchLong(id: string, bullets: string, impact: number) {
    const res = await fetch(`/api/settings/memory/long-term/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bullets: textToBullets(bullets), impactScore: impact }),
      credentials: "same-origin",
    });
    if (!res.ok) setErr("\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
    else void loadOverview();
  }

  async function delLong(id: string) {
    if (!confirm("\u3053\u306e\u9577\u671f\u8a18\u61b6\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f")) return;
    const res = await fetch(`/api/settings/memory/long-term/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) setErr("\u524a\u9664\u306b\u5931\u6557\u3057\u307e\u3057\u305f");
    else void loadOverview();
  }

  async function reconcileChatForEntry(entryId: string) {
    setReconcileBusy(true);
    setReconcileMsg(null);
    setReconcileFailNote(null);
    setErr(null);
    try {
      const res = await fetch("/api/settings/memory/reconcile-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, force: reconcileForce }),
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
        skipped?: boolean;
        reason?: string;
        processed?: { entryId: string; entryDateYmd: string }[];
      };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : "補完に失敗しました");
        return;
      }
      if (j.skipped) {
        setReconcileMsg(typeof j.reason === "string" ? j.reason : "スキップしました");
        return;
      }
      const dates = (j.processed ?? []).map((p) => p.entryDateYmd).join(", ");
      setReconcileMsg(dates ? `反映しました: ${dates}` : "反映しました");
      await loadOverview();
    } finally {
      setReconcileBusy(false);
    }
  }

  async function reconcileChatBatch() {
    if (
      !confirm(
        "通常はチャット後に自動で走る記憶抽出が、まだ取り込めていない日だけを新しい順に補完します（前回補完時と同じメッセージ件数の日はスキップ）。OpenAI の利用が増えます。続行しますか？",
      )
    ) {
      return;
    }
    setReconcileBusy(true);
    setReconcileMsg(null);
    setReconcileFailNote(null);
    setErr(null);
    try {
      const res = await fetch("/api/settings/memory/reconcile-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allWithChat: true, force: reconcileForce }),
        credentials: "same-origin",
      });
      const rawText = await res.text();
      let j = {} as {
        error?: string;
        ok?: boolean;
        processed?: { entryId: string; entryDateYmd: string }[];
        hint?: string;
        skippedUpToDate?: string[];
        failures?: { entryDateYmd: string; reason: string; detailJa: string }[];
        stoppedEarlyByCap?: boolean;
        llmRuns?: number;
        maxLlmRunsPerRequest?: number;
      };
      try {
        j = JSON.parse(rawText) as typeof j;
      } catch {
        j = {};
      }
      if (!res.ok) {
        setErr(
          typeof j.error === "string"
            ? j.error
            : rawText.trim().slice(0, 240) || "一括補完に失敗しました",
        );
        return;
      }
      const n = j.processed?.length ?? 0;
      const dates = (j.processed ?? []).map((p) => p.entryDateYmd).join(", ");
      const skipNote =
        j.skippedUpToDate && j.skippedUpToDate.length > 0
          ? `（補完済みでスキップ: ${j.skippedUpToDate.join(", ")}${j.skippedUpToDate.length >= 12 ? "…" : ""}）`
          : "";
      setReconcileMsg(
        n === 0
          ? `処理した日はありませんでした。${j.hint ?? ""}${skipNote}`.trim()
          : `${n} 日分を処理しました: ${dates}${j.hint ? `。${j.hint}` : ""}${skipNote}`,
      );
      const fails = j.failures ?? [];
      if (fails.length > 0) {
        setReconcileFailNote(
          `一部の日で補完に失敗しました:\n${fails.map((f) => `${f.entryDateYmd} — ${f.detailJa}`).join("\n")}`,
        );
      }
      await loadOverview();
    } finally {
      setReconcileBusy(false);
    }
  }

  const accOuter = "mb-3 overflow-hidden rounded-xl border border-zinc-200/90 bg-white dark:border-zinc-700/80 dark:bg-zinc-950/40";
  const sumOuter =
    "flex cursor-pointer list-none items-center justify-between gap-2 bg-zinc-50/95 px-3 py-2.5 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-100/90 dark:bg-zinc-900/55 dark:text-zinc-50 dark:hover:bg-zinc-800/70 [&::-webkit-details-marker]:hidden";
  const sumInner =
    "flex cursor-pointer list-none items-center justify-between gap-2 border-t border-zinc-100 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100 dark:hover:bg-zinc-900/50 [&::-webkit-details-marker]:hidden";

  return (
    <>
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
          {"\u8a18\u61b6\u306e\u78ba\u8a8d\uff08MAS\uff09"}
        </h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {
            "\u65e5\u8a18\u3054\u3068\u306e\u77ed\u671f\u30fb\u9577\u671f\u8a18\u61b6\u3092\u4e00\u89a7\u3067\u78ba\u8a8d\u30fb\u7de8\u96c6\u3067\u304d\u307e\u3059\u3002E2EE \u306e\u65e5\u306f\u672c\u6587\u304c\u30b5\u30fc\u30d0\u4e0a\u3067\u5e73\u6587\u3067\u306a\u3044\u305f\u3081\u3001\u8a18\u61b6\u306e\u4e3b\u306a\u5143\u306f\u30c1\u30e3\u30c3\u30c8\u306b\u306a\u308a\u307e\u3059\u3002"
          }
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {"\u8a18\u61b6\u3092\u4e00\u89a7\u3067\u958b\u304f"}
        </button>
      </section>

      {open ? (
        <div
          className="fixed inset-0 z-[230] flex items-end justify-center bg-black/40 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-memory-title"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            closePanel();
          }}
        >
          <div
            className="flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl dark:bg-zinc-950 sm:rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 id="settings-memory-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {"\u8a18\u61b6\u306e\u4e00\u89a7"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  closePanel();
                }}
                className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {"\u9589\u3058\u308b"}
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-0">
              <div className="sticky top-0 z-10 -mx-4 mb-3 space-y-2 border-b border-zinc-100 bg-white px-4 pb-2 pt-2 dark:border-zinc-800 dark:bg-zinc-950">
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  {"\u691c\u7d22\uff08\u65e5\u4ed8\u30fb\u5185\u5bb9\uff09"}
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoComplete="off"
                    placeholder="例: 2026-04-17"
                    className="settings-memory-compact-text mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                {overview && !loading ? (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {"\u65e5\u8a18 "}
                    {overview.entries.length}
                    {" \u65e5 \u00b7 \u77ed\u671f "}
                    {shortTotalCount}
                    {" \u4ef6 \u00b7 \u9577\u671f "}
                    {longTotalCount}
                    {" \u4ef6"}
                  </p>
                ) : null}
                {overview && !loading && (overview.entries.length > 0 || (overview.pendingChatMemoryBackfillCount ?? 0) > 0) ? (
                  <details className="group/backfill rounded-lg border border-zinc-200/80 bg-white/70 px-2 py-2 dark:border-zinc-700/70 dark:bg-zinc-950/40">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 truncate">チャット記憶の一括補完（強制取得）</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {typeof overview.pendingChatMemoryBackfillCount === "number" ? (
                          <span className="shrink-0 rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] font-normal text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                            {overview.pendingChatMemoryBackfillCount} 日
                          </span>
                        ) : null}
                        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open/backfill:rotate-180 dark:text-zinc-400" />
                      </span>
                    </summary>

                    <div className="mt-2 space-y-1.5">
                      <p className="text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                        日記の本文や AI 草案は<span className="font-medium">不要</span>です。各日の
                        <span className="font-medium">振り返りチャット</span>が user/assistant 合わせて2通以上あり、かつ
                        自動の記憶抽出がまだ追いついていない日だけが一括補完の対象です
                        {typeof overview.pendingChatMemoryBackfillCount === "number"
                          ? `（現在およそ ${overview.pendingChatMemoryBackfillCount} 日が未同期です）`
                          : ""}
                        。
                      </p>
                      <label className="flex cursor-pointer items-start gap-2 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                        <input
                          type="checkbox"
                          checked={reconcileForce}
                          onChange={(e) => setReconcileForce(e.target.checked)}
                          className="mt-0.5 rounded border-zinc-300"
                        />
                        <span>
                          強制再補完（同一メッセージ件数でも再実行。既に補完済みの会話を上書き確認したいとき）
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={reconcileBusy}
                        onClick={() => void reconcileChatBatch()}
                        className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-left text-xs font-medium text-emerald-950 hover:bg-emerald-100/90 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
                      >
                        {reconcileBusy
                          ? "チャットから記憶を取り込み中…"
                          : "未同期のチャットだけ記憶に一括補完（新しい順）"}
                      </button>
                      <details className="rounded-md border border-zinc-200/80 bg-white/70 px-2 py-1.5 dark:border-zinc-700/70 dark:bg-zinc-950/40">
                        <summary className="cursor-pointer list-none text-[10px] font-medium text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
                          補完の注意（クリックで詳細）
                        </summary>
                        <p className="mt-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                          直近のメッセージを優先して読みます。前回補完時と同じメッセージ件数で済んでいるスレッドはスキップされます（新規発言後に再実行、または強制再補完）。
                          環境変数 MEMORY_BACKFILL_MAX_ENTRIES_PER_REQUEST
                          を数値にすると1リクエストあたりの補完回数に上限を付けられます（未設定なら未同期分をまとめて処理）。
                        </p>
                      </details>
                    </div>
                  </details>
                ) : null}
                {reconcileMsg ? (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">{reconcileMsg}</p>
                ) : null}
                {reconcileFailNote ? (
                  <p className="whitespace-pre-wrap text-[11px] leading-snug text-amber-900 dark:text-amber-200">
                    {reconcileFailNote}
                  </p>
                ) : null}
              </div>

              {err ? <p className="mb-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
              {loading ? <p className="text-sm text-zinc-500">読み込み中…</p> : null}

              {overview && !loading ? (
                <div className="space-y-2 pb-6">
                  {overview.entries.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
                      {"\u65e5\u8a18\u30a8\u30f3\u30c8\u30ea\u304c\u307e\u3060\u3042\u308a\u307e\u305b\u3093\u3002"}
                    </p>
                  ) : null}

                  <details open className={accOuter}>
                    <summary className={sumOuter}>
                      <span>{"\u77ed\u671f\u8a18\u61b6\uff08\u65e5\u4ed8\u5225\uff09"}</span>
                      <span className="shrink-0 rounded-full bg-zinc-200/80 px-2 py-0.5 text-[11px] font-normal text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                        {q
                          ? `${filteredShort.length}\u65e5\u4ed8 / ${filteredShort.reduce((n, g) => n + g.items.length, 0)}\u4ef6`
                          : `${overview.shortTermGroups.length}\u65e5\u4ed8 / ${shortTotalCount}\u4ef6`}
                      </span>
                    </summary>
                    <div className="border-t border-zinc-100 dark:border-zinc-800">
                      {filteredShort.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-zinc-500">
                          {q
                            ? "\u6761\u4ef6\u306b\u4e00\u81f4\u3059\u308b\u77ed\u671f\u8a18\u61b6\u306f\u3042\u308a\u307e\u305b\u3093\u3002"
                            : "\u77ed\u671f\u8a18\u61b6\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093\u3002"}
                        </p>
                      ) : (
                        filteredShortByMonth.map((m) => (
                          <details key={m.month} className="group/month border-t border-zinc-100 first:border-t-0 dark:border-zinc-800">
                            <summary className={sumInner}>
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-mono text-[13px] text-zinc-900 dark:text-zinc-100">
                                  {m.month === "不明" ? "日付不明" : m.month}
                                </span>
                                <span className="shrink-0 text-[11px] font-normal text-zinc-500">
                                  {`（${m.groups.length}日付 / ${m.groups.reduce((n, g) => n + g.items.length, 0)}件）`}
                                </span>
                              </span>
                              <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open/month:rotate-180 dark:text-zinc-400" />
                            </summary>
                            <div className="border-t border-zinc-50 bg-zinc-50/40 dark:border-zinc-800/80 dark:bg-zinc-900/20">
                              {m.groups.map((g) => (
                                <details
                                  key={g.entryId}
                                  className="group/date border-t border-zinc-100 first:border-t-0 dark:border-zinc-800"
                                >
                                  <summary className={sumInner}>
                                    <span className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-[13px] text-zinc-900 dark:text-zinc-100">
                                        {g.entryDateYmd}
                                      </span>
                                      {g.encryptionMode === "EXPERIMENTAL_E2EE" ? (
                                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                                          E2EE
                                        </span>
                                      ) : null}
                                      <span className="text-[11px] font-normal text-zinc-500">
                                        {g.items.length === 0 ? "（0件）" : `（${g.items.length}件）`}
                                      </span>
                                    </span>
                                  </summary>
                                  <div className="border-t border-zinc-50 px-2 py-2 dark:border-zinc-800/80">
                                    <div className="mb-2 px-1">
                                      <button
                                        type="button"
                                        disabled={reconcileBusy}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          void reconcileChatForEntry(g.entryId);
                                        }}
                                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[10px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                                      >
                                        この日のチャットを記憶に反映
                                      </button>
                                    </div>
                                    {g.items.length === 0 ? (
                                      <p className="px-2 py-2 text-[11px] text-zinc-500">
                                        {"\u3053\u306e\u65e5\u306b\u306f\u77ed\u671f\u8a18\u61b6\u3042\u308a\u307e\u305b\u3093\u3002"}
                                      </p>
                                    ) : (
                                      <ul className="space-y-2">
                                        {g.items.map((s) => (
                                          <li
                                            key={s.id}
                                            className="rounded-lg border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
                                          >
                                            <ShortEditor
                                              entryDateYmd={g.entryDateYmd}
                                              initialText={bulletsToText(s.bullets)}
                                              salience={s.salience}
                                              onSave={(txt, sal) => void patchShort(s.id, txt, sal)}
                                              onDelete={() => void delShort(s.id)}
                                            />
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </details>
                              ))}
                            </div>
                          </details>
                        ))
                      )}
                    </div>
                  </details>

                  <details open className={accOuter}>
                    <summary className={sumOuter}>
                      <span>{"\u9577\u671f\u8a18\u61b6\uff08\u65e5\u4ed8\u5225\u30fb\u5171\u901a\uff09"}</span>
                      <span className="shrink-0 rounded-full bg-emerald-100/90 px-2 py-0.5 text-[11px] font-normal text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                        {q
                          ? `${filteredLong.length}\u30b0\u30eb\u30fc\u30d7 / ${filteredLong.reduce((n, g) => n + g.items.length, 0)}\u4ef6`
                          : `${overview.longTermGroups.length}\u30b0\u30eb\u30fc\u30d7 / ${longTotalCount}\u4ef6`}
                      </span>
                    </summary>
                    <div className="border-t border-zinc-100 dark:border-zinc-800">
                      {filteredLong.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-zinc-500">
                          {q
                            ? "\u6761\u4ef6\u306b\u4e00\u81f4\u3059\u308b\u9577\u671f\u8a18\u61b6\u306f\u3042\u308a\u307e\u305b\u3093\u3002"
                            : "\u9577\u671f\u8a18\u61b6\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093\u3002"}
                        </p>
                      ) : (
                        filteredLong.map((g) => {
                          const title =
                            g.key === "common"
                              ? "\u5171\u901a\uff08\u7279\u5b9a\u306e\u65e5\u306b\u7d10\u3065\u304b\u306a\u3044\uff09"
                              : g.entryDateYmd ?? "\u65e5\u4ed8\u4e0d\u660e";
                          return (
                            <details key={g.key} className="group/date border-t border-zinc-100 first:border-t-0 dark:border-zinc-800">
                              <summary className={sumInner}>
                                <span className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="font-mono text-[13px] text-zinc-900 dark:text-zinc-100">{title}</span>
                                  <span className="text-[11px] font-normal text-zinc-500">
                                    {`\uff08${g.items.length}\u4ef6\uff09`}
                                  </span>
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open/date:rotate-180 dark:text-zinc-400" />
                              </summary>
                              <div className="border-t border-emerald-50/80 bg-emerald-50/20 px-2 py-2 dark:border-emerald-950/30 dark:bg-emerald-950/10">
                                <ul className="space-y-2">
                                  {g.items.map((l) => (
                                    <li
                                      key={l.id}
                                      className="rounded-lg border border-emerald-200/70 bg-white p-2 shadow-sm dark:border-emerald-900/45 dark:bg-zinc-950"
                                    >
                                      <LongEditor
                                        anchorDateYmd={g.key === "common" ? null : g.entryDateYmd}
                                        initialText={bulletsToText(l.bullets)}
                                        impact={l.impactScore}
                                        onSave={(txt, imp) => void patchLong(l.id, txt, imp)}
                                        onDelete={() => void delLong(l.id)}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </details>
                          );
                        })
                      )}
                    </div>
                  </details>

                  <details className={accOuter}>
                    <summary className={sumOuter}>
                      <span>AgentMemory</span>
                      <span className="shrink-0 rounded-full bg-zinc-200/80 px-2 py-0.5 text-[11px] font-normal text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                        {filteredAgent.length}
                        {" \u4ef6"}
                      </span>
                    </summary>
                    <div className="border-t border-zinc-100 px-2 py-2 dark:border-zinc-800">
                      {filteredAgent.length === 0 ? (
                        <p className="py-3 text-center text-xs text-zinc-500">{"\u306a\u3057"}</p>
                      ) : (
                        <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-900/30">
                          {filteredAgent.map((a) => (
                            <li
                              key={`${a.domain}:${a.memoryKey}`}
                              className="break-words font-mono text-[10px] leading-snug text-zinc-700 dark:text-zinc-300"
                            >
                              <span className="text-emerald-700 dark:text-emerald-400">{a.domain}</span>
                              {" / "}
                              <span className="text-zinc-600 dark:text-zinc-400">{a.memoryKey}</span>
                              {": "}
                              {a.memoryValue}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function useSyncedState<T>(value: T): [T, Dispatch<SetStateAction<T>>] {
  const [inner, setInner] = useState(value);
  useEffect(() => {
    setInner(value);
  }, [value]);
  return [inner, setInner];
}

function ShortEditor({
  entryDateYmd,
  initialText,
  salience,
  onSave,
  onDelete,
}: {
  entryDateYmd: string;
  initialText: string;
  salience: number;
  onSave: (text: string, salience: number) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useSyncedState(initialText);
  const [sal, setSal] = useSyncedState(salience);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(taRef, text, { maxRows: 3 });

  const insertDateTag = useCallback(() => {
    const tag = `[${entryDateYmd}] `;
    const el = taRef.current;
    if (!el) {
      setText((prev) => tag + prev);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setText((prev) => prev.slice(0, start) + tag + prev.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + tag.length;
      el.setSelectionRange(pos, pos);
    });
  }, [entryDateYmd, setText]);

  const exampleFutureYmd = useMemo(() => {
    const t = new Date(`${entryDateYmd}T12:00:00+09:00`).getTime() + 7 * 86400000;
    return formatYmdTokyo(new Date(t));
  }, [entryDateYmd]);

  return (
    <div className="space-y-2">
      <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
        基準日（このエントリ・Asia/Tokyo）: <span className="font-mono text-zinc-700 dark:text-zinc-300">{formatEntryYmdWeekdayJa(entryDateYmd)}</span>
        。文頭に日付を付けず自然な一文で書いてください。来週・明日など<strong>相対表現の直後だけ</strong>
        <span className="font-mono"> (YYYY-MM-DD)</span> を添えて具体日にしてください（例:{" "}
        <span className="font-mono">来週頃({exampleFutureYmd}) 面接</span>）。時刻が話題なら{" "}
        <span className="font-mono">HH:mm</span> も。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={insertDateTag}
          className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {`[${entryDateYmd}] をカーソル位置に挿入`}
        </button>
      </div>
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={1}
        placeholder={`例:\n打合せが長引いた\n来週頃(${exampleFutureYmd}) 10:00 面接`}
        className="settings-memory-compact-text w-full resize-none rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
          <span className="shrink-0">salience</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sal}
            onChange={(e) => setSal(Number(e.target.value))}
            className="min-w-0 flex-1"
          />
          <span className="shrink-0">{sal.toFixed(2)}</span>
        </label>
        <div className="flex shrink-0 flex-nowrap gap-2">
          <button
            type="button"
            onClick={() => onSave(text, sal)}
            className="whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="whitespace-nowrap rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-400"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}

function LongEditor({
  anchorDateYmd,
  initialText,
  impact,
  onSave,
  onDelete,
}: {
  anchorDateYmd: string | null;
  initialText: string;
  impact: number;
  onSave: (text: string, impact: number) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useSyncedState(initialText);
  const [imp, setImp] = useSyncedState(impact);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(taRef, text, { maxRows: 3 });

  const insertDateTag = useCallback(() => {
    if (!anchorDateYmd) return;
    const tag = `[${anchorDateYmd}] `;
    const el = taRef.current;
    if (!el) {
      setText((prev) => tag + prev);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setText((prev) => prev.slice(0, start) + tag + prev.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + tag.length;
      el.setSelectionRange(pos, pos);
    });
  }, [anchorDateYmd, setText]);

  const longPlaceholderExample = useMemo(
    () =>
      anchorDateYmd
        ? "一人暮らしは3年目\n内向的だがチームでは発言するようになった\n記念日: 2019-06-01（毎年固定で覚えたいものだけ日付）"
        : null,
    [anchorDateYmd],
  );

  const longPlaceholderCommon =
    "例:\nライトノベルより純文学寄りが好み\nストレス時は15分散歩で切り替える";

  return (
    <div className="space-y-2">
      {anchorDateYmd ? (
        <>
          <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
            このグループの基準日: <span className="font-mono text-zinc-700 dark:text-zinc-300">{formatEntryYmdWeekdayJa(anchorDateYmd)}</span>
            。長期は<strong>続く特性・価値観・関係の前提</strong>向けです。些細な予定や一過性の日付は短期へ。
            <strong>誕生日・記念日・入社日など後から照合したい固定事実</strong>にだけ <span className="font-mono">YYYY-MM-DD</span> や短い表記を。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={insertDateTag}
              className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {`[${anchorDateYmd}] をカーソル位置に挿入`}
            </button>
          </div>
        </>
      ) : (
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          <strong>ユーザー共通</strong>の長期です。好み・習慣・続く前提事実を。<strong>AgentMemory</strong>向けの部活・職場区分などはドメイン行に。
          <strong>誕生日や毎年の固定イベント以外</strong>は不要な日付を書かないでください。
        </p>
      )}
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={1}
        placeholder={anchorDateYmd && longPlaceholderExample ? `例:\n${longPlaceholderExample}` : longPlaceholderCommon}
        className="settings-memory-compact-text w-full resize-none rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
      />
      <label className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
        impact (0–100)
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(imp)}
          onChange={(e) => setImp(Number(e.target.value))}
          className="w-20 rounded border border-zinc-200 px-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <div className="flex flex-nowrap gap-2">
        <button
          type="button"
          onClick={() => onSave(text, imp)}
          className="whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="whitespace-nowrap rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-400"
        >
          削除
        </button>
      </div>
    </div>
  );
}
