"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PlutchikWheel } from "@/components/plutchik-wheel";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { WeatherAmPmDisplay } from "@/components/weather-am-pm-display";
import { PLUTCHIK_MIN_TRANSCRIPT_CHARS } from "@/lib/emotion/plutchik-min-transcript";
import { parsePlutchikStoredJson } from "@/lib/emotion/plutchik";
import type { JournalDraftMaterial } from "@/lib/reflective-chat-diary-nudge-rules";
import { EntryAiMetaButtons, type EntryAiMetaKind } from "./entry-ai-meta-buttons";
import { EntryImages } from "./entry-images";

type WeatherJsonForPanel = {
  kind?: string;
  am?: {
    time?: string;
    weatherLabel?: string;
    temperatureC?: number | null;
    weatherCode?: number | null;
  };
  pm?: {
    time?: string;
    weatherLabel?: string;
    temperatureC?: number | null;
    weatherCode?: number | null;
  };
  date?: string;
  dataSource?: "forecast" | "archive";
  locationNote?: string;
};

export type JournalDraftPanelImage = { id: string; mimeType: string; byteSize: number; rotationQuarterTurns?: number; caption?: string };

/** flushSync 直後の fetch がメインスレッドを塞ぐ前に、ブラウザに描画を譲る */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** 草案プレビュー内タグチップ（入力・追加ボタンと同一行高） */
function journalTagChipClass(active: boolean): string {
  return `inline-flex h-[22px] max-w-full items-center gap-0.5 rounded-md border px-1.5 text-left text-[10px] font-medium leading-none transition ${
    active
      ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
  }`;
}

/** チップと同じ外寸・文字サイズのタグ入力（ネイティブ input の余計な行高を抑える） */
function journalTagInputClass(): string {
  return [
    "box-border inline-flex h-[22px] min-w-[3.25rem] max-w-[7.5rem] shrink-0 items-center rounded-md border border-zinc-200 bg-white px-1.5 py-0",
    "text-left text-[10px] font-medium leading-none text-zinc-900 outline-none ring-emerald-500/20",
    "placeholder:text-zinc-400 focus:border-emerald-500/50 focus:ring-1",
    "dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder:text-zinc-500",
  ].join(" ");
}

function splitTagsFromStored(raw: string): string[] {
  return raw
    .split(/[,，、\s　]+/)
    .map((t) => t.normalize("NFKC").trim())
    .filter(Boolean);
}

function uniqueTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const n = t.normalize("NFKC").trim().slice(0, 48);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.slice(0, 12);
}

function encodeTagsForStorage(tags: string[]): string {
  return uniqueTagList(tags).join("、");
}

function normalizeMetaTitle(raw: string): string {
  return raw
    .replace(/^[\s"'「『]+/, "")
    .replace(/[\s"'」』]+$/, "")
    .trim()
    .slice(0, 120);
}

function buildMetaContextBody(draft: string | null, draftTitle: string, draftTags: string): string | undefined {
  const body = typeof draft === "string" ? draft.trim() : "";
  if (!body) return undefined;
  const parts: string[] = [];
  const t = draftTitle.trim();
  const g = draftTags.trim();
  if (t) parts.push(`【現在のタイトル案】\n${t}`);
  if (g) parts.push(`【現在のタグ案】\n${g}`);
  parts.push(`【本文（日記草案）】\n${body}`);
  return parts.join("\n\n").slice(0, 96_000);
}

const JOURNAL_DRAFT_CACHE_V = 1 as const;

type JournalDraftPreviewCache = {
  v: typeof JOURNAL_DRAFT_CACHE_V;
  draft: string;
  draftTitle: string;
  draftTags: string;
  /** `autoGenerateKey` の値で、このスレッド向けの自動生成をすでに消化済みとみなす（再マウント時の誤再生成防止） */
  lastConsumedAutoGenerateKey: number;
};

function journalDraftStorageKey(entryId: string, threadId: string): string {
  return `dailySnap.journalDraft.v${JOURNAL_DRAFT_CACHE_V}:${entryId}:${threadId}`;
}

function readJournalDraftCache(entryId: string, threadId: string): JournalDraftPreviewCache | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const key = journalDraftStorageKey(entryId, threadId);
    let raw = localStorage.getItem(key);
    if (!raw && typeof sessionStorage !== "undefined") {
      const legacy = sessionStorage.getItem(key);
      if (legacy) {
        try {
          localStorage.setItem(key, legacy);
          sessionStorage.removeItem(key);
          raw = legacy;
        } catch {
          /* quota / private mode */
        }
      }
    }
    if (!raw) return null;
    const j = JSON.parse(raw) as JournalDraftPreviewCache;
    if (j?.v !== JOURNAL_DRAFT_CACHE_V || typeof j.draft !== "string") return null;
    return {
      v: JOURNAL_DRAFT_CACHE_V,
      draft: j.draft,
      draftTitle: typeof j.draftTitle === "string" ? j.draftTitle : "",
      draftTags: typeof j.draftTags === "string" ? j.draftTags : "",
      lastConsumedAutoGenerateKey:
        typeof j.lastConsumedAutoGenerateKey === "number" && Number.isFinite(j.lastConsumedAutoGenerateKey)
          ? j.lastConsumedAutoGenerateKey
          : 0,
    };
  } catch {
    return null;
  }
}

function writeJournalDraftCache(entryId: string, threadId: string, payload: JournalDraftPreviewCache): void {
  if (typeof localStorage === "undefined") return;
  const key = journalDraftStorageKey(entryId, threadId);
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    /* quota / private mode */
  }
}

function clearJournalDraftCache(entryId: string, threadId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(journalDraftStorageKey(entryId, threadId));
  } catch {
    /* ignore */
  }
}

export function JournalDraftPanel({
  entryId,
  threadId,
  entryDateYmd,
  images,
  weatherJson,
  onApplied,
  variant = "chat-footer",
  autoGenerateKey,
  /** 今日ページヘッダー「草案を作成」など。手動「会話から草案を生成」と同じ分岐（弱材料は確認ダイアログ）。 */
  userUiGenerateKey = 0,
  initialPlutchikAnalysis = null,
  transcriptCharCount = 0,
  journalDraftRefreshKey = 0,
  /** ヘッダー「編集」などからプレビューシートを開く（値が増えるたびに開く） */
  openPreviewSignal = 0,
  /** キャッシュが無いときプレビュー内タイトル・タグの初期値（保存済みエントリ） */
  seedTitleWhenNoDraftCache = "",
  seedTagsWhenNoDraftCache = "",
  /** false のときカード UI を出さずモーダルのみ（本文ありエントリ用ホスト） */
  showChrome = true,
  /** standalone かつスマホ: カード型クロームのみ非表示（プレビュー等のモーダルはそのまま） */
  hideStandaloneChromeOnMobile = false,
  /** 保存済みエントリ本文。草案キャッシュが無いときプレビュー左欄に参考表示する */
  savedEntryBodyForPreview = "",
}: {
  entryId: string;
  threadId: string | null;
  /** 写真・画像ブロック表示に必要（未指定ならモーダル内では非表示） */
  entryDateYmd?: string;
  images?: JournalDraftPanelImage[];
  /** エントリに保存された午前・午後天気（`EntryActions` と同じ JSON） */
  weatherJson?: unknown;
  onApplied?: () => void;
  variant?: "chat-footer" | "inset" | "standalone";
  /** Increment from parent (e.g. after chat SSE) to run the same flow as the generate button. */
  autoGenerateKey?: number;
  /** UI からの明示操作（チャット完了の自動キーとは別）。未指定は 0。 */
  userUiGenerateKey?: number;
  /** サーバーから渡す `DailyEntry.plutchikAnalysis` */
  initialPlutchikAnalysis?: unknown | null;
  /** 会話転写の文字数（`buildEntryChatTranscript` と同一基準）。 */
  transcriptCharCount?: number;
  /** チャット送信のたびに親が進めると、会話素材判定を再取得する */
  journalDraftRefreshKey?: number;
  openPreviewSignal?: number;
  seedTitleWhenNoDraftCache?: string;
  seedTagsWhenNoDraftCache?: string;
  showChrome?: boolean;
  hideStandaloneChromeOnMobile?: boolean;
  savedEntryBodyForPreview?: string;
}) {
  const router = useRouter();
  const refresh = useCallback(() => {
    startTransition(() => {
      if (onApplied) {
        onApplied();
      } else {
        router.refresh();
      }
    });
  }, [onApplied, router]);
  const titleId = useId();
  const lastAutoKey = useRef(0);
  const lastUserUiGenerateKey = useRef(0);
  const lastOpenPreviewSignal = useRef(0);

  const [draft, setDraft] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consolidateMemory, setConsolidateMemory] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tagAddInput, setTagAddInput] = useState("");
  const [emotionBusy, setEmotionBusy] = useState(false);
  const [emotionError, setEmotionError] = useState<string | null>(null);
  const [mobileTool, setMobileTool] = useState<null | "images" | "weather" | "emotion" | "ai">(null);
  const [journalMaterial, setJournalMaterial] = useState<JournalDraftMaterial | null>(null);
  const [weakGenerateDialog, setWeakGenerateDialog] = useState<{
    reasonJa: string;
    tier: JournalDraftMaterial["tier"];
  } | null>(null);

  const canUseThread = threadId != null && threadId.length > 0;
  const canRunPlutchik =
    canUseThread && (transcriptCharCount ?? 0) >= PLUTCHIK_MIN_TRANSCRIPT_CHARS;
  const parsedPlutchik = useMemo(() => parsePlutchikStoredJson(initialPlutchikAnalysis ?? null), [initialPlutchikAnalysis]);
  const tagChipList = useMemo(() => uniqueTagList(splitTagsFromStored(draftTags)), [draftTags]);
  const hasDraftText = useMemo(() => (draft ?? "").trim().length > 0, [draft]);
  const savedBodyTrimmed = useMemo(() => (savedEntryBodyForPreview ?? "").trim(), [savedEntryBodyForPreview]);
  const hasSavedBodyPreview = savedBodyTrimmed.length > 0;
  const imageContextMarkdown = hasDraftText ? draft! : hasSavedBodyPreview ? savedBodyTrimmed : undefined;
  const metaContextBody = useMemo(() => {
    if (hasDraftText) return buildMetaContextBody(draft, draftTitle, draftTags);
    if (hasSavedBodyPreview) {
      const parts: string[] = [];
      const t = draftTitle.trim();
      const g = draftTags.trim();
      if (t) parts.push(`【現在のタイトル案】\n${t}`);
      if (g) parts.push(`【現在のタグ案】\n${g}`);
      parts.push(`【本文（保存済み・参考）】\n${savedBodyTrimmed}`);
      return parts.join("\n\n").slice(0, 96_000);
    }
    return buildMetaContextBody(draft, draftTitle, draftTags);
  }, [hasDraftText, hasSavedBodyPreview, draft, draftTitle, draftTags, savedBodyTrimmed]);

  const onMetaResult = useCallback((payload: { kind: EntryAiMetaKind; result: string }) => {
    const { kind, result } = payload;
    const text = result.trim();
    if (!text) return;
    if (kind === "title") {
      setDraftTitle(normalizeMetaTitle(text));
      return;
    }
    if (kind === "tags") {
      setDraftTags(encodeTagsForStorage(splitTagsFromStored(text)));
      return;
    }
    if (kind === "daily_summary") {
      setDraft((d) => (d == null || !d.trim() ? d : `${d.trim()}\n\n---\n### 日次要約（AI）\n\n${text}\n`));
    }
  }, []);
  const showImagesPanel = Boolean(entryDateYmd && images !== undefined);
  const weatherAmPm = useMemo(() => {
    const w = weatherJson as WeatherJsonForPanel | null | undefined;
    if (!w || w.kind !== "am_pm" || !w.am || !w.pm) return null;
    return {
      am: w.am,
      pm: w.pm,
      date: w.date,
      dataSource: w.dataSource,
      locationNote: w.locationNote,
    };
  }, [weatherJson]);

  useEffect(() => {
    lastUserUiGenerateKey.current = 0;
  }, [entryId, threadId]);

  useEffect(() => {
    if (!threadId) {
      setDraft(null);
      setDraftTitle("");
      setDraftTags("");
      lastAutoKey.current = 0;
      return;
    }
    const hit = readJournalDraftCache(entryId, threadId);
    if (!hit) {
      setDraft(null);
      setDraftTitle("");
      setDraftTags("");
      lastAutoKey.current = 0;
      return;
    }
    setDraft((hit.draft ?? "").trim() ? hit.draft : null);
    setDraftTitle(hit.draftTitle);
    setDraftTags(hit.draftTags);
    lastAutoKey.current = hit.lastConsumedAutoGenerateKey;
  }, [entryId, threadId]);

  useEffect(() => {
    if (!threadId) {
      setJournalMaterial(null);
      setWeakGenerateDialog(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/ai/journal-draft?entryId=${encodeURIComponent(entryId)}&threadId=${encodeURIComponent(threadId)}`,
        );
        const data = (await res.json().catch(() => ({}))) as { journalDraftMaterial?: JournalDraftMaterial };
        if (!cancelled && data.journalDraftMaterial) setJournalMaterial(data.journalDraftMaterial);
      } catch {
        if (!cancelled) setJournalMaterial(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId, threadId, journalDraftRefreshKey]);

  useEffect(() => {
    lastOpenPreviewSignal.current = 0;
  }, [threadId]);

  useEffect(() => {
    const s = openPreviewSignal ?? 0;
    if (s <= 0 || s === lastOpenPreviewSignal.current) return;
    if (!threadId) return;
    lastOpenPreviewSignal.current = s;
    // useEffect 内では flushSync 不可（React 既レンダー中）。同一ティックの setState は自動バッチされる。
    setWeakGenerateDialog(null);
    setPreviewOpen(true);
    setError(null);
    setTagAddInput("");
    const hit = readJournalDraftCache(entryId, threadId);
    if (hit) {
      setDraft((hit.draft ?? "").trim() ? hit.draft : null);
      setDraftTitle(hit.draftTitle);
      setDraftTags(hit.draftTags);
    } else {
      setDraft(null);
      setDraftTitle(seedTitleWhenNoDraftCache.trim());
      setDraftTags(seedTagsWhenNoDraftCache.trim());
    }
  }, [openPreviewSignal, entryId, threadId, seedTitleWhenNoDraftCache, seedTagsWhenNoDraftCache]);

  const runGenerate = useCallback(
    async (opts?: { viaAutoKey?: number; forceInsufficient?: boolean }) => {
      if (!threadId) return;
      flushSync(() => {
        setPreviewOpen(true);
        setBusy(true);
        setError(null);
        setDraft(null);
        setDraftTitle("");
        setDraftTags("");
        setTagAddInput("");
      });
      await yieldToPaint();
      try {
        const res = await fetch("/api/ai/journal-draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId,
            threadId,
            forceInsufficient: opts?.forceInsufficient === true,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          draft?: string;
          suggestedTitle?: string;
          suggestedTags?: string;
        };
        if (!res.ok) {
          if (res.status === 409 && data.code === "journal_draft_material_insufficient") {
            setPreviewOpen(false);
            setError(typeof data.error === "string" ? data.error : "会話の材料がまだ十分ではありません。");
            return;
          }
          setError(typeof data.error === "string" ? data.error : "生成に失敗しました");
          return;
        }
        const nextDraft = typeof data.draft === "string" ? data.draft : "";
        const nextTitle = typeof data.suggestedTitle === "string" ? data.suggestedTitle : "";
        const nextTags = typeof data.suggestedTags === "string" ? data.suggestedTags : "";
        setDraft(nextDraft.trim() ? nextDraft : null);
        setDraftTitle(nextTitle);
        setDraftTags(nextTags);
        const consumed =
          opts?.viaAutoKey !== undefined && Number.isFinite(opts.viaAutoKey) ? opts.viaAutoKey : lastAutoKey.current;
        writeJournalDraftCache(entryId, threadId, {
          v: JOURNAL_DRAFT_CACHE_V,
          draft: nextDraft,
          draftTitle: nextTitle,
          draftTags: nextTags,
          lastConsumedAutoGenerateKey: consumed,
        });
      } finally {
        setBusy(false);
      }
    },
    [entryId, threadId],
  );

  const requestGenerate = useCallback(
    async (opts?: { viaAutoKey?: number; allowWeakMaterialPrompt?: boolean }) => {
      if (!threadId) return;
      setError(null);
      let m = journalMaterial;
      if (!m) {
        try {
          const res = await fetch(
            `/api/ai/journal-draft?entryId=${encodeURIComponent(entryId)}&threadId=${encodeURIComponent(threadId)}`,
          );
          const data = (await res.json().catch(() => ({}))) as { journalDraftMaterial?: JournalDraftMaterial };
          m = data.journalDraftMaterial ?? null;
          if (m) setJournalMaterial(m);
        } catch {
          m = null;
        }
      }
      if (m && m.tier !== "rich") {
        const blockWeakAuto =
          opts?.viaAutoKey !== undefined && opts.allowWeakMaterialPrompt !== true;
        if (blockWeakAuto) {
          return;
        }
        setWeakGenerateDialog({ reasonJa: m.reasonJa, tier: m.tier });
        return;
      }
      await runGenerate({ viaAutoKey: opts?.viaAutoKey, forceInsufficient: false });
    },
    [entryId, threadId, journalMaterial, runGenerate],
  );

  useEffect(() => {
    const k = autoGenerateKey ?? 0;
    if (k <= 0 || k === lastAutoKey.current || !threadId) return;
    lastAutoKey.current = k;
    void requestGenerate({ viaAutoKey: k });
  }, [autoGenerateKey, threadId, requestGenerate]);

  useEffect(() => {
    const k = userUiGenerateKey ?? 0;
    if (k <= 0 || k === lastUserUiGenerateKey.current || !threadId) return;
    lastUserUiGenerateKey.current = k;
    void requestGenerate({ allowWeakMaterialPrompt: true });
  }, [userUiGenerateKey, threadId, requestGenerate]);

  async function runPlutchikAnalysis() {
    if (!threadId || !canRunPlutchik) return;
    setEmotionBusy(true);
    setEmotionError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}/plutchik-emotion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setEmotionError(typeof data.error === "string" ? data.error : "分析に失敗しました");
        return;
      }
      refresh();
    } finally {
      setEmotionBusy(false);
    }
  }

  async function approve() {
    if (!draft?.trim()) return;
    flushSync(() => {
      setBusy(true);
      setError(null);
    });
    await yieldToPaint();
    try {
      const res = await fetch("/api/ai/journal-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId,
          draftMarkdown: draft,
          entryTitle: draftTitle.trim(),
          tagsCsv: draftTags,
          consolidateMemory,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "反映に失敗しました");
        return;
      }
      setDraft(null);
      setDraftTitle("");
      setDraftTags("");
      setTagAddInput("");
      setConsolidateMemory(false);
      setPreviewOpen(false);
      if (threadId) clearJournalDraftCache(entryId, threadId);
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
    <>
      {weakGenerateDialog ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/50 px-3 py-6 sm:items-center sm:px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${titleId}-weak-gen-title`}
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
            <h4 id={`${titleId}-weak-gen-title`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              草案の材料がまだ十分ではありません
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{weakGenerateDialog.reasonJa}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
              このまま生成すると、会話にない内容が混ざりやすい不完全な案になりがちです。それでも続けますか？
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                onClick={() => setWeakGenerateDialog(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                onClick={() => {
                  setWeakGenerateDialog(null);
                  void runGenerate({ forceInsufficient: true });
                }}
              >
                それでも生成する
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showChrome ? (
        <div
          className={[
            shell,
            hideStandaloneChromeOnMobile && variant === "standalone" ? "max-md:hidden" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI 日記（草案）</h3>

          {!canUseThread && (
            <p className="mt-2 text-[11px] text-zinc-500">振り返りチャットが始まると、会話から草案を生成できます。</p>
          )}
          {error && !previewOpen ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={busy || !canUseThread}
            onClick={() => void requestGenerate()}
            className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {busy ? "生成中…" : "会話から草案を生成"}
          </button>
          {canUseThread && journalMaterial ? (
            <p className="mt-1.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">{journalMaterial.reasonJa}</p>
          ) : null}
          {hasDraftText && !previewOpen ? (
            <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
              草案ができています。{" "}
              <button type="button" className="font-medium text-emerald-700 underline dark:text-emerald-400" onClick={() => setPreviewOpen(true)}>
                プレビューを開く
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      <ResponsiveDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        labelledBy={titleId}
        dialogId="journal-draft-preview-dialog"
        presentation="sheetBottom"
        panelClassName="h-[min(92dvh,92svh)] min-h-0"
      >
        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-start gap-2 border-b border-zinc-100 px-3 py-2.5 pr-2 dark:border-zinc-800 sm:px-4 sm:py-3 sm:pr-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-50">
                AI 日記（草案）プレビュー
              </h2>
              <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 sm:text-[11px]">
                本文・タグ・写真を確認のうえ反映してください（大きい画面では左右に並びます）。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="閉じる"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <span className="text-2xl font-light leading-none" aria-hidden>
                ×
              </span>
            </button>
          </div>

          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch">
            {/* 左: モバイルは列内で本文が flex 伸長。lg では本文 pre 内スクロール */}
            <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-zinc-100 lg:overflow-hidden lg:border-r lg:dark:border-zinc-800">
              <div className="flex min-h-0 flex-1 flex-col space-y-2.5 px-3 py-2.5 sm:space-y-3 sm:px-4 sm:py-3 max-lg:min-h-[min(80dvh,calc(92svh-11rem))] lg:h-full lg:min-h-0">
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {busy && !hasDraftText ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">会話を読み取り、草案・タイトル・タグを作成しています…</p>
                ) : null}
                {!busy && !hasDraftText && previewOpen && canUseThread ? (
                  <div className="space-y-3">
                    {hasSavedBodyPreview ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">保存済みの本文（エントリ）</p>
                        <pre className="max-h-[min(52dvh,28rem)] overflow-y-auto overscroll-y-contain whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
                          {savedBodyTrimmed}
                        </pre>
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {hasSavedBodyPreview
                          ? "上の本文は日記に保存済みです。端末の草案キャッシュはまだありません。下のボタン、または右カラムの「会話から草案を生成」から、会話ベースの新しい草案を作成できます。"
                          : "この端末に保存された草案がまだありません（または本文が空のまま保存されています）。下のボタン、または右カラムの「会話から草案を生成」から作成できます。"}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void requestGenerate()}
                        className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        会話から草案を生成
                      </button>
                    </div>
                  </div>
                ) : null}
                {!busy && !hasDraftText && previewOpen && !canUseThread ? (
                  <div className="space-y-3">
                    {hasSavedBodyPreview ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">保存済みの本文（エントリ）</p>
                        <pre className="max-h-[min(52dvh,28rem)] overflow-y-auto overscroll-y-contain whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
                          {savedBodyTrimmed}
                        </pre>
                      </div>
                    ) : null}
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">振り返りチャットが始まると、会話から草案を生成できます。</p>
                  </div>
                ) : null}
                {hasDraftText ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400" htmlFor={`${titleId}-title`}>
                        タイトル
                      </label>
                      <input
                        id={`${titleId}-title`}
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        maxLength={120}
                        placeholder="（生成結果が入ります）"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-semibold leading-snug text-zinc-900 shadow-inner outline-none ring-emerald-500/20 placeholder:font-normal placeholder:text-zinc-400 focus:border-emerald-500/50 focus:ring-2 sm:px-3 sm:text-base sm:leading-6 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500"
                      />
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400" htmlFor={`${titleId}-tag-add`}>
                        タグ
                      </label>
                      <div className="max-h-[min(26vh,168px)] overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-200 bg-white p-2 sm:max-h-[min(34vh,200px)] sm:rounded-xl sm:p-3 dark:border-zinc-700 dark:bg-zinc-950">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                          {tagChipList.length === 0 ? (
                            <span className="text-[10px] text-zinc-400">まだタグがありません</span>
                          ) : (
                            tagChipList.map((t) => (
                              <span key={t} className={journalTagChipClass(true)}>
                                <span className="min-w-0 truncate">{t}</span>
                                <button
                                  type="button"
                                  aria-label={`「${t}」を削除`}
                                  className="-mr-px inline-flex size-[18px] shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-emerald-600/15 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-emerald-400/15 dark:hover:text-zinc-100"
                                  onClick={() => {
                                    setDraftTags(encodeTagsForStorage(tagChipList.filter((x) => x !== t)));
                                  }}
                                >
                                  <span className="text-[11px] leading-none" aria-hidden>
                                    ×
                                  </span>
                                </button>
                              </span>
                            ))
                          )}
                          <input
                            id={`${titleId}-tag-add`}
                            type="text"
                            value={tagAddInput}
                            onChange={(e) => setTagAddInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const parts = splitTagsFromStored(tagAddInput);
                                if (!parts.length) return;
                                setDraftTags(encodeTagsForStorage([...tagChipList, ...parts]));
                                setTagAddInput("");
                              }
                            }}
                            placeholder="追加…"
                            className={journalTagInputClass()}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const parts = splitTagsFromStored(tagAddInput);
                              if (!parts.length) return;
                              setDraftTags(encodeTagsForStorage([...tagChipList, ...parts]));
                              setTagAddInput("");
                            }}
                            className={journalTagChipClass(false)}
                          >
                            追加
                          </button>
                        </div>
                      </div>
                    </div>
                    <pre className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-y-contain whitespace-pre-wrap rounded-lg bg-zinc-50 p-2.5 text-[11px] leading-relaxed text-zinc-800 ring-1 ring-zinc-200 sm:rounded-xl sm:p-3 sm:text-xs lg:min-h-[10rem] lg:max-h-none lg:flex-1 dark:bg-zinc-900/80 dark:text-zinc-100 dark:ring-zinc-700">
                      {draft}
                    </pre>

                    {/* モバイル: ツールはボタンで別モーダルに（本文を優先して広く見せる） */}
                    <div className="lg:hidden">
                      <div className="grid grid-cols-4 gap-1.5">
                        {showImagesPanel ? (
                          <button
                            type="button"
                            onClick={() => setMobileTool("images")}
                            className="min-h-9 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          >
                            写真
                          </button>
                        ) : (
                          <div />
                        )}
                        {weatherAmPm ? (
                          <button
                            type="button"
                            onClick={() => setMobileTool("weather")}
                            className="min-h-9 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          >
                            天気
                          </button>
                        ) : (
                          <div />
                        )}
                        <button
                          type="button"
                          onClick={() => setMobileTool("emotion")}
                          className="min-h-9 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          感情
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileTool("ai")}
                          className="min-h-9 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          AI操作
                        </button>
                      </div>

                      <label className="mt-3 flex cursor-pointer items-start gap-2 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                        <input
                          type="checkbox"
                          checked={consolidateMemory}
                          onChange={(e) => setConsolidateMemory(e.target.checked)}
                          className="mt-0.5 size-[15px] shrink-0 rounded border-zinc-300"
                        />
                        <span>
                          最終版として記憶を整理する（短期・長期・AgentMemory を日記＋会話に合わせて更新。試行のたびに ON にしないでください）
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={busy || !draft?.trim()}
                        onClick={() => void approve()}
                        className="mt-3 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        本文へ反映（AI 日記セクション）
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* 右: この列だけが縦スクロール（ツールレール） */}
            <aside
              id="journal-draft-tools-rail"
              className="hidden w-full shrink-0 flex-col overflow-y-auto overscroll-y-contain border-t border-zinc-100 dark:border-zinc-800 lg:flex lg:max-h-full lg:min-h-0 lg:w-[min(100%,22rem)] lg:shrink-0 lg:self-stretch lg:border-l lg:border-t-0 xl:w-96"
            >
              {showImagesPanel ? (
                <div className="shrink-0 border-b border-zinc-100 p-2.5 dark:border-zinc-800 sm:p-3 lg:min-h-0 lg:max-h-[min(40dvh,14rem)] lg:overflow-x-auto lg:overflow-y-hidden lg:pb-2">
                  <EntryImages
                    entryId={entryId}
                    entryDateYmd={entryDateYmd!}
                    images={images!}
                    galleryLayout="journalPreviewAside"
                  />
                </div>
              ) : null}
              {weatherAmPm ? (
                <div className="shrink-0 border-b border-zinc-100 p-2.5 dark:border-zinc-800 sm:p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">天気（この日の記録）</p>
                  <WeatherAmPmDisplay
                    am={weatherAmPm.am}
                    pm={weatherAmPm.pm}
                    date={weatherAmPm.date}
                    dataSource={weatherAmPm.dataSource}
                    locationNote={weatherAmPm.locationNote}
                    compact
                  />
                </div>
              ) : null}
              <div className="flex flex-col justify-start space-y-2.5 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:space-y-3 sm:p-3 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/40 sm:p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">プルチック感情</p>
                  <p className="mt-1 text-[10px] leading-snug text-zinc-600 sm:text-[11px] dark:text-zinc-400">
                    会話から8原感情の傾向を推定し、この日のエントリに保存します。
                  </p>
                  {!canRunPlutchik && canUseThread ? (
                    <p className="mt-2 text-[10px] leading-snug text-amber-700 sm:text-[11px] dark:text-amber-400">
                      会話があと少し長くなれば分析できます（目安 {PLUTCHIK_MIN_TRANSCRIPT_CHARS} 文字以上の転写）。
                    </p>
                  ) : null}
                  {emotionError ? <p className="mt-2 text-xs text-red-600">{emotionError}</p> : null}
                  <div className="mt-2 flex min-w-0 flex-col items-center gap-1.5 sm:mt-3 sm:gap-2">
                    <PlutchikWheel
                      analysis={parsedPlutchik.ok ? parsedPlutchik.data : null}
                      phase={emotionBusy ? "loading" : parsedPlutchik.ok ? "ready" : "idle"}
                    />
                    {parsedPlutchik.ok ? (
                      <p className="text-center text-[10px] leading-snug text-zinc-600 sm:text-[11px] dark:text-zinc-400">
                        {parsedPlutchik.data.summaryJa}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy || emotionBusy || !canRunPlutchik}
                    onClick={() => void runPlutchikAnalysis()}
                    className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-800 disabled:opacity-50 sm:mt-3 sm:px-3 sm:py-2 sm:text-xs dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {emotionBusy ? "分析中…" : parsedPlutchik.ok ? "感情を再分析" : "プルチックで感情を分析"}
                  </button>
                </div>
                <div className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 p-2.5 dark:border-zinc-700 dark:bg-zinc-900/40 sm:p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">AI 操作（簡易）</p>
                  <EntryAiMetaButtons
                    entryId={entryId}
                    stackDescription="草案本文を根拠にタイトル・タグ・要約を更新します（反映前でもプレビューにそのまま入ります）。画像生成も草案に沿います。"
                    stackButtons
                    stackButtonColumns={2}
                    omitCalendarMemory
                    contextBody={metaContextBody}
                    persistMetaToEntry={false}
                    onMetaResult={onMetaResult}
                    imageContextMarkdown={imageContextMarkdown}
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-[10px] leading-snug text-zinc-600 sm:gap-3 sm:text-[11px] dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={consolidateMemory}
                    onChange={(e) => setConsolidateMemory(e.target.checked)}
                    className="mt-0.5 size-[15px] shrink-0 rounded border-zinc-300 sm:size-4"
                  />
                  <span>
                    最終版として記憶を整理する（短期・長期・AgentMemory を日記＋会話に合わせて更新。試行のたびに ON にしないでください）
                  </span>
                </label>
                <button
                  type="button"
                  disabled={busy || !draft?.trim()}
                  onClick={() => void approve()}
                  className="min-h-10 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 sm:min-h-11 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm"
                >
                  本文へ反映（AI 日記セクション）
                </button>
              </div>
            </aside>
          </div>
        </div>

        {/* モバイル: ツールは個別モーダル */}
        <ResponsiveDialog
          open={mobileTool === "images"}
          onClose={() => setMobileTool(null)}
          labelledBy={`${titleId}-mobile-images-title`}
          dialogId="journal-draft-mobile-images-dialog"
          zClass="z-[60]"
          presentation="island"
        >
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <h3 id={`${titleId}-mobile-images-title`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                写真・画像
              </h3>
              <button
                type="button"
                onClick={() => setMobileTool(null)}
                className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                閉じる
              </button>
            </div>
          </div>
          <div className="px-4 py-3">
            {showImagesPanel ? (
              <EntryImages entryId={entryId} entryDateYmd={entryDateYmd!} images={images!} />
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">写真パネルは利用できません。</p>
            )}
          </div>
        </ResponsiveDialog>

        <ResponsiveDialog
          open={mobileTool === "weather"}
          onClose={() => setMobileTool(null)}
          labelledBy={`${titleId}-mobile-weather-title`}
          dialogId="journal-draft-mobile-weather-dialog"
          zClass="z-[60]"
          presentation="island"
        >
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <h3 id={`${titleId}-mobile-weather-title`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                天気（この日の記録）
              </h3>
              <button
                type="button"
                onClick={() => setMobileTool(null)}
                className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                閉じる
              </button>
            </div>
          </div>
          <div className="px-4 py-3">
            {weatherAmPm ? (
              <WeatherAmPmDisplay
                am={weatherAmPm.am}
                pm={weatherAmPm.pm}
                date={weatherAmPm.date}
                dataSource={weatherAmPm.dataSource}
                locationNote={weatherAmPm.locationNote}
              />
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">天気データがありません。</p>
            )}
          </div>
        </ResponsiveDialog>

        <ResponsiveDialog
          open={mobileTool === "emotion"}
          onClose={() => setMobileTool(null)}
          labelledBy={`${titleId}-mobile-emotion-title`}
          dialogId="journal-draft-mobile-emotion-dialog"
          zClass="z-[60]"
          presentation="island"
        >
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <h3 id={`${titleId}-mobile-emotion-title`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                プルチック感情
              </h3>
              <button
                type="button"
                onClick={() => setMobileTool(null)}
                className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                閉じる
              </button>
            </div>
          </div>
          <div className="space-y-3 px-4 py-3">
            <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
              会話から8原感情の傾向を推定し、この日のエントリに保存します。
            </p>
            {!canRunPlutchik && canUseThread ? (
              <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                会話があと少し長くなれば分析できます（目安 {PLUTCHIK_MIN_TRANSCRIPT_CHARS} 文字以上の転写）。
              </p>
            ) : null}
            {emotionError ? <p className="text-xs text-red-600">{emotionError}</p> : null}
            <div className="flex flex-col items-center gap-2">
              <PlutchikWheel analysis={parsedPlutchik.ok ? parsedPlutchik.data : null} phase={emotionBusy ? "loading" : parsedPlutchik.ok ? "ready" : "idle"} />
              {parsedPlutchik.ok ? (
                <p className="text-center text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">{parsedPlutchik.data.summaryJa}</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy || emotionBusy || !canRunPlutchik}
              onClick={() => void runPlutchikAnalysis()}
              className="min-h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {emotionBusy ? "分析中…" : parsedPlutchik.ok ? "感情を再分析" : "プルチックで感情を分析"}
            </button>
          </div>
        </ResponsiveDialog>

        <ResponsiveDialog
          open={mobileTool === "ai"}
          onClose={() => setMobileTool(null)}
          labelledBy={`${titleId}-mobile-ai-title`}
          dialogId="journal-draft-mobile-ai-dialog"
          zClass="z-[60]"
          presentation="island"
        >
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <h3 id={`${titleId}-mobile-ai-title`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                AI 操作（簡易）
              </h3>
              <button
                type="button"
                onClick={() => setMobileTool(null)}
                className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                閉じる
              </button>
            </div>
          </div>
          <div className="px-4 py-3">
            <EntryAiMetaButtons
              entryId={entryId}
              stackDescription="草案本文を根拠にタイトル・タグ・要約を更新します（反映前でもプレビューにそのまま入ります）。画像生成も草案に沿います。"
              stackButtons
              stackButtonColumns={2}
              omitCalendarMemory
              contextBody={metaContextBody}
              persistMetaToEntry={false}
              onMetaResult={onMetaResult}
              imageContextMarkdown={imageContextMarkdown}
            />
          </div>
        </ResponsiveDialog>
      </ResponsiveDialog>
    </>
  );
}
