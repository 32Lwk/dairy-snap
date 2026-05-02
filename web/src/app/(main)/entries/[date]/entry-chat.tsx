"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, startTransition, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { TimetableEditorSheetPanel } from "@/components/timetable-editor-sheet-panel";
import { emitLocalSettingsSavedFromJson } from "@/lib/settings-sync-client";
import { emptyTimetable, serializeTimetable } from "@/lib/timetable";
import { isOpeningPendingModel } from "@/lib/opening-pending";
import { stripAssistantMetaEchoPrefix } from "@/lib/chat-assistant-sanitize";
import { JournalDraftPanel } from "./journal-draft-panel";

/** When the on-screen keyboard shrinks visual viewport, cap chat height so the composer stays usable. */
function useVisualViewportKeyboardMaxHeight(): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const innerH = window.innerHeight;
      const h = vv.height;
      if (!Number.isFinite(innerH) || !Number.isFinite(h) || h <= 0) {
        setStyle(undefined);
        return;
      }
      if (h >= innerH * 0.94) {
        setStyle(undefined);
        return;
      }
      setStyle({ maxHeight: Math.max(260, Math.floor(h * 0.9)) });
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);
  return style;
}

type SettingsChangeTip = {
  previous: { dayBoundaryEndTime: string | null; timeZone: string | null };
  next: { dayBoundaryEndTime: string | null; timeZone: string | null };
};

type Msg = {
  id: string;
  role: string;
  content: string;
  model?: string | null;
  /** メッセージ行の `updatedAt`（ISO）。開口は本文確定時刻に近い */
  sentAt?: string | null;
  /** このアシスタント発話直後にチャットから設定が適用されたとき（セッション中のみ） */
  settingsChangeTip?: SettingsChangeTip;
};

function formatBoundaryLabel(v: string | null | undefined): string {
  if (v == null || v === "") return "既定(00:00)";
  return v;
}

function formatTzLabel(v: string | null | undefined): string {
  if (v == null || v === "") return "既定";
  return v;
}

function settingsChangeSummaryLine(tip: SettingsChangeTip): string {
  const parts: string[] = [];
  if (String(tip.previous.dayBoundaryEndTime ?? "") !== String(tip.next.dayBoundaryEndTime ?? "")) {
    parts.push(
      `区切り ${formatBoundaryLabel(tip.previous.dayBoundaryEndTime)} → ${formatBoundaryLabel(tip.next.dayBoundaryEndTime)}`,
    );
  }
  if (String(tip.previous.timeZone ?? "") !== String(tip.next.timeZone ?? "")) {
    parts.push(`TZ ${formatTzLabel(tip.previous.timeZone)} → ${formatTzLabel(tip.next.timeZone)}`);
  }
  return parts.length > 0 ? parts.join(" ／ ") : "設定を更新しました";
}

function PendingSettingsProposalBanner({
  summaryJa,
  onDismiss,
  onRefresh,
}: {
  summaryJa: string;
  onDismiss: () => void;
  onRefresh: () => void;
}) {
  return (
    <details className="shrink-0 border-b border-violet-200/90 bg-violet-50/95 dark:border-violet-900/40 dark:bg-violet-950/45 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer select-none list-none px-3 py-1.5 text-[11px] font-medium text-violet-950 sm:px-4 sm:py-2 sm:text-xs dark:text-violet-100">
        保留中の設定変更
        <span className="ml-1.5 font-normal text-violet-800/80 dark:text-violet-200/80">（タップで詳細）</span>
      </summary>
      <p className="px-3 pb-1 text-[11px] leading-snug text-violet-950 sm:px-4 sm:text-xs sm:leading-relaxed dark:text-violet-100">{summaryJa}</p>
      <div className="flex flex-wrap gap-2 px-3 pb-2 text-[11px] text-violet-900/90 sm:gap-3 sm:px-4 dark:text-violet-200/90">
        <button type="button" className="underline" onClick={() => onRefresh()}>
          最新を読み込む
        </button>
        <button type="button" className="underline" onClick={() => onDismiss()}>
          閉じる
        </button>
      </div>
    </details>
  );
}

/** デフォルト高さ（`layoutHeight="fill"` のモバイル時のみ max-md: で利用）。ヘッダー縮小に合わせ 100svh 控除をやや小さく */
const DEFAULT_CHAT_PANEL_MOBILE_HEIGHT =
  "max-md:min-h-[min(58dvh,420px)] max-md:max-h-[min(86dvh,min(780px,calc(100svh-8.25rem)))] max-md:landscape:max-h-[min(70dvh,min(560px,calc(100svh-7.75rem)))]";

/** チャットはプレーンなテキスト表示のため、** や単独の * を読みやすくする */
/** React Strict Mode 再マウントでも同一 entry の開口 fetch が二重に走らないようにする */
const entryOpeningInFlight = new Set<string>();

function stripLightMarkdownForChatDisplay(text: string): string {
  let s = text;
  for (let i = 0; i < 12; i++) {
    const next = s.replace(/\*\*([\s\S]+?)\*\*/g, "$1");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\*([^*\n]+?)\*/g, "$1");
}

function formatAssistantSentAtTokyo(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(d);
  } catch {
    return iso;
  }
}

function UserMessageBubble({
  m,
  onUpdated,
  onRequestCascadeDelete,
  hasFollowingMessages,
  followingMessageCount,
}: {
  m: Msg;
  onUpdated: (
    id: string,
    content: string,
    meta?: {
      editOutcome?: "kept_tail" | "regenerated_tail";
      newAssistant?: { id: string; role: string; content: string; model?: string | null; sentAt?: string | null };
    },
  ) => void;
  /** 楽観的 UI は親で行い、ここでは ID のみ通知 */
  onRequestCascadeDelete: (userMessageId: string) => void;
  /** この発言のあとにメッセージがあるときだけ「再実行 / 再実行しない」を出す */
  hasFollowingMessages: boolean;
  /** この発言より後ろのメッセージ件数（削除確認・注意文用） */
  followingMessageCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const [busy, setBusy] = useState(false);
  /** PATCH 送信中の種別（ボタンラベル用） */
  const [pendingAction, setPendingAction] = useState<null | "keep" | "regenerate">(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deleteDialogTitleId = useId();

  useEffect(() => {
    setText(m.content);
  }, [m.id, m.content]);

  async function commitEdit(followingAction: "keep" | "regenerate") {
    const next = text.trim();
    if (!next) return;
    const unchanged = next === m.content;
    if (unchanged && followingAction === "keep") {
      setEditing(false);
      setText(m.content);
      return;
    }
    flushSync(() => {
      setBusy(true);
      setPendingAction(followingAction);
      setSaveError(null);
    });
    try {
      const res = await fetch(`/api/chat-messages/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: next,
          followingAction: hasFollowingMessages ? followingAction : "keep",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        editOutcome?: "kept_tail" | "regenerated_tail";
        error?: string;
        newAssistant?: { id: string; role: string; content: string; model?: string | null; sentAt?: string | null };
      };
      if (!res.ok) {
        setSaveError(typeof data.error === "string" ? data.error : "保存に失敗しました");
        return;
      }
      onUpdated(m.id, next, {
        editOutcome: data.editOutcome,
        newAssistant: data.newAssistant,
      });
      setEditing(false);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  function openDeleteDialog() {
    if (busy) return;
    setDeleteDialogOpen(true);
  }

  function confirmDelete() {
    setDeleteDialogOpen(false);
    onRequestCascadeDelete(m.id);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ResponsiveDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        labelledBy={deleteDialogTitleId}
        dialogId={`entry-chat-delete-${m.id}`}
        presentation="island"
        zClass="z-[70]"
        panelClassName="max-w-md"
      >
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <h2
            id={deleteDialogTitleId}
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            会話の削除
          </h2>
          {followingMessageCount > 0 ? (
            <div className="space-y-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              <p>
                この発言と、あと {followingMessageCount}{" "}
                件のメッセージ（AI の返信などを含む）がまとめて削除されます。元に戻せません。
              </p>
              <ul className="list-inside list-disc space-y-1 pl-0.5">
                <li>本文だけ直したい → 閉じて「編集」</li>
                <li>このあとを残したまま AI に答え直させたい → 編集の「再実行」</li>
                <li>この時点から会話を切り詰めたい → 下の「削除する」</li>
              </ul>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              この発言を削除しますか？（このあとに続くメッセージはありません）
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm outline-none ring-emerald-500/20 transition hover:bg-zinc-50 focus-visible:ring-2 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={confirmDelete}
              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none ring-red-500/30 transition hover:bg-red-700 focus-visible:ring-2 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
            >
              削除する
            </button>
          </div>
        </div>
      </ResponsiveDialog>
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">あなた</span>
      <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-gradient-to-br from-zinc-800 to-zinc-900 px-3 py-2 text-[13px] leading-snug text-white shadow-sm sm:px-3.5 sm:py-2.5 sm:text-sm sm:leading-normal dark:from-zinc-200 dark:to-zinc-100 dark:text-zinc-900">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full min-w-[12rem] rounded-lg border border-white/20 bg-white/10 p-2 text-sm text-white placeholder:text-white/50 dark:border-zinc-600 dark:bg-white dark:text-zinc-900"
              rows={3}
            />
            {saveError ? (
              <p className="text-[11px] leading-snug text-amber-200 dark:text-red-700">{saveError}</p>
            ) : null}
            {hasFollowingMessages ? (
              <p className="text-[10px] leading-snug text-white/75 dark:text-zinc-600">
                会話の流れを残すなら「保存」、このあとを消して AI に答え直すなら「再実行」。スレッドを短く切るなら編集をやめて「削除」（この発言以降がまとめて消えます）。
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setText(m.content);
                  setSaveError(null);
                }}
                className="text-xs text-white/80 underline dark:text-zinc-700"
              >
                キャンセル
              </button>
              {hasFollowingMessages ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void commitEdit("regenerate")}
                    className="rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-zinc-950 dark:bg-amber-400 dark:text-zinc-900"
                  >
                    {busy && pendingAction === "regenerate" ? "再実行中…" : "再実行"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void commitEdit("keep")}
                    className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {busy && pendingAction === "keep" ? "保存中…" : "保存"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void commitEdit("keep")}
                  className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {busy && pendingAction === "keep" ? "保存中…" : "保存"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap leading-relaxed">{stripLightMarkdownForChatDisplay(m.content)}</p>
            <div className="mt-1.5 flex justify-end gap-3 text-[11px] text-white/70 dark:text-zinc-600">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSaveError(null);
                  setEditing(true);
                }}
                className="underline"
              >
                編集
              </button>
              <button type="button" disabled={busy} onClick={() => openDeleteDialog()} className="underline">
                削除
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  streaming,
  subNote,
  sentAtIso,
  settingsChangeTip,
  onUndoSettings,
  undoBusy,
  onDismissSettingsTip,
}: {
  content: string;
  streaming?: boolean;
  /** 待機中など、本文の下に控えめに表示する補足 */
  subNote?: string;
  /** DB のメッセージ更新時刻（開口・応答の生成・送信の記録） */
  sentAtIso?: string | null;
  settingsChangeTip?: SettingsChangeTip;
  onUndoSettings?: () => void;
  undoBusy?: boolean;
  onDismissSettingsTip?: () => void;
}) {
  const shown = stripLightMarkdownForChatDisplay(stripAssistantMetaEchoPrefix(content));
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">AI</span>
      <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-bl-md border border-zinc-200/80 bg-white px-3 py-2 text-[13px] leading-snug text-zinc-900 shadow-sm sm:px-3.5 sm:py-2.5 sm:text-sm sm:leading-relaxed dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
        <p className="whitespace-pre-wrap">{shown}</p>
        {subNote ? (
          <p className="mt-1.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{subNote}</p>
        ) : null}
        {streaming && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-emerald-500 align-middle" />}
      </div>
      {sentAtIso && !streaming ? (
        <time
          dateTime={sentAtIso}
          className="max-w-[min(100%,28rem)] pl-0.5 text-[10px] font-normal tabular-nums leading-none text-zinc-400 dark:text-zinc-500"
          title={`${sentAtIso}（記録時刻・東京表示）`}
        >
          生成・送信 {formatAssistantSentAtTokyo(sentAtIso)}
        </time>
      ) : null}
      {!streaming && settingsChangeTip ? (
        <div className="max-w-[min(100%,28rem)] rounded-xl border border-emerald-200/90 bg-emerald-50/95 px-3 py-2 text-[11px] leading-snug text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/45 dark:text-emerald-100">
          <p>
            <span className="font-semibold">設定を更新: </span>
            {settingsChangeSummaryLine(settingsChangeTip)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={undoBusy}
              onClick={() => onUndoSettings?.()}
              className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {undoBusy ? "戻しています…" : "元に戻す"}
            </button>
            <button
              type="button"
              disabled={undoBusy}
              onClick={() => onDismissSettingsTip?.()}
              className="rounded-lg border border-emerald-300/80 px-2.5 py-1 text-[11px] font-medium text-emerald-900 hover:bg-emerald-100/80 dark:border-emerald-800 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EntryChat({
  entryId,
  threadId: initialThreadId,
  initialMessages,
  variant = "default",
  journalDraftPlacement = "below-chat",
  onThreadIdChange,
  onJournalDraftGenerateRequest,
  /** 各チャット完了時に草案パネル側で会話素材判定を取り直す（親に別置きパネルがあるとき用） */
  onJournalDraftContextRefresh,
  chatSecurityNoticeJa,
  pendingSettingsSummaryJa = null,
  layoutHeight = "default",
  /** 本文が左カラムにあるときなど、会話エリア（メッセージ＋送信）を折りたたみ可能にする */
  conversationAccordion = false,
}: {
  entryId: string;
  threadId: string | null;
  initialMessages: Msg[];
  variant?: "default" | "compact";
  journalDraftPlacement?: "below-chat" | "none";
  onThreadIdChange?: (threadId: string | null) => void;
  /** サーバー判定で草案プレビューを走らせるとき、親の `JournalDraftPanel` 用キーを進める */
  onJournalDraftGenerateRequest?: () => void;
  onJournalDraftContextRefresh?: () => void;
  /** Server-driven notice after async security review (medium). */
  chatSecurityNoticeJa?: string | null;
  /** 保留中の設定変更の要約（「はい」適用前の確認用） */
  pendingSettingsSummaryJa?: string | null;
  /**
   * `fill`: 親（例: 今日ページの左カラム）が高さを与えるとき、md 以上でメッセージ＋入力を列いっぱいに伸ばす。
   * モバイルは従来どおり dvh ベースの高さ。
   */
  layoutHeight?: "default" | "fill";
  conversationAccordion?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [tid, setTid] = useState<string | null>(initialThreadId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  /** サーバー SSE `phase: preparing` の hintJa（待機バブル用） */
  const [assistantWaitHint, setAssistantWaitHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [securityBannerDismissed, setSecurityBannerDismissed] = useState(false);
  const [settingsUndoBusy, setSettingsUndoBusy] = useState(false);
  const [pendingProposalDismissed, setPendingProposalDismissed] = useState(false);
  const [timetableEditorOpen, setTimetableEditorOpen] = useState(false);
  const [timetableValue, setTimetableValue] = useState(() => serializeTimetable(emptyTimetable()));
  const [timetableStLevel, setTimetableStLevel] = useState("");
  const [timetableBusy, setTimetableBusy] = useState(false);
  const [journalDraftAutoKey, setJournalDraftAutoKey] = useState(0);
  const [journalDraftPanelRefreshKey, setJournalDraftPanelRefreshKey] = useState(0);
  const [conversationOpen, setConversationOpen] = useState(!conversationAccordion);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const vvShellStyle = useVisualViewportKeyboardMaxHeight();
  /** 楽観削除後、RSC の props がサーバーと一致するまで initialMessages で上書きしない */
  const awaitingRefreshAfterDeleteRef = useRef(false);
  const lastDeleteAnchorIdRef = useRef<string | null>(null);

  useEffect(() => {
    setConversationOpen(!conversationAccordion);
  }, [conversationAccordion, entryId, initialThreadId]);

  useEffect(() => {
    if (busy || streaming) return;
    if (awaitingRefreshAfterDeleteRef.current && lastDeleteAnchorIdRef.current) {
      const anchor = lastDeleteAnchorIdRef.current;
      if (initialMessages.some((x) => x.id === anchor)) {
        return;
      }
      awaitingRefreshAfterDeleteRef.current = false;
      lastDeleteAnchorIdRef.current = null;
      setMessages(initialMessages);
      return;
    }
    setMessages(initialMessages);
  }, [initialMessages, busy, streaming]);

  useEffect(() => {
    setSecurityBannerDismissed(false);
  }, [chatSecurityNoticeJa, initialThreadId]);

  useEffect(() => {
    setPendingProposalDismissed(false);
  }, [pendingSettingsSummaryJa, initialThreadId]);

  useEffect(() => {
    onThreadIdChange?.(tid);
  }, [tid, onThreadIdChange]);

  useEffect(() => {
    setJournalDraftPanelRefreshKey(0);
  }, [entryId, initialThreadId]);

  // メッセージ枠内で末尾へ（fill でも md+ は親高さに合わせたうえで内部スクロール）
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, streaming]);

  const serverHasOpeningPending = useMemo(
    () => initialMessages.some((m) => isOpeningPendingModel(m.model)),
    [initialMessages],
  );

  /** 別タブ／再マウントで開口が走っているとき、プレースホルダが埋まるまで再取得する */
  useEffect(() => {
    if (!serverHasOpeningPending || busy || streaming) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 2000);
    return () => window.clearInterval(id);
  }, [serverHasOpeningPending, router, busy, streaming]);

  /** 空スレッド時は AI から先に開口（振り返りを始める） */
  useEffect(() => {
    const hasRealExchange = initialMessages.some(
      (m) => m.role === "user" || (m.role === "assistant" && m.content.trim().length > 0),
    );
    /** サーバーが既にアシスタント行だけある（開口保留・model 未伝播のプレースホルダ等）とき、開口を重ねない */
    const hasAssistantRow = initialMessages.some((m) => m.role === "assistant");
    if (
      hasRealExchange ||
      serverHasOpeningPending ||
      hasAssistantRow ||
      entryOpeningInFlight.has(entryId)
    ) {
      return;
    }
    entryOpeningInFlight.add(entryId);

    void (async () => {
      setError(null);
      setBusy(true);
      setStreaming("");
      try {
        const doRequest = async (stream: boolean) => {
          const url = stream ? "/api/ai/chat/opening" : "/api/ai/chat/opening?stream=0";
          return await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entryId, clientNow: new Date().toISOString() }),
          });
        };

        let res = await doRequest(true);
        let ct = res.headers.get("content-type") ?? "";

        // ストリーミングが無い/使えない環境（プロキシの制約等）では JSON フォールバックを試す
        if (res.ok && !ct.includes("application/json") && !res.body) {
          res = await doRequest(false);
          ct = res.headers.get("content-type") ?? "";
        }
        if (!res.ok) {
          const raw = await res.text();
          let message: string | undefined;
          try {
            const data = JSON.parse(raw) as { error?: unknown };
            if (typeof data.error === "string" && data.error.trim()) message = data.error;
          } catch {
            /* 非 JSON（プロキシの HTML 等） */
          }
          setError(
            message ??
              (raw.trim()
                ? `開口メッセージの取得に失敗しました（${res.status}）`
                : "開口メッセージの取得に失敗しました"),
          );
          return;
        }
        if (ct.includes("application/json")) {
          const data = (await res.json()) as {
            skipped?: boolean;
            threadId?: string;
            openingInProgress?: boolean;
            assistant?: string;
          };
          if (data.skipped && data.threadId) {
            setTid(data.threadId);
            router.refresh();
          }
          if (data.threadId && typeof data.assistant === "string" && data.assistant.trim()) {
            setTid(data.threadId);
            router.refresh();
          }
          return;
        }
        if (!res.body) {
          // 200 でもボディが無い場合がある（プロキシ/ランタイムの制約など）。原因が見えるように情報を出す。
          const raw = await res.text().catch(() => "");
          setError(
            raw.trim()
              ? `開口メッセージの取得に失敗しました（${res.status} / no body）`
              : `開口メッセージの取得に失敗しました（${res.status} / no body）`,
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistant = "";
        let sseBuf = "";
        let doneSeen = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuf += decoder.decode(value, { stream: true });
          const parts = sseBuf.split("\n");
          sseBuf = parts.pop() ?? "";
          for (const line of parts) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            try {
              const json = JSON.parse(payload) as { delta?: string; done?: boolean; threadId?: string };
              if (json.delta) {
                assistant += json.delta;
                setStreaming(assistant);
              }
              if (json.done && json.threadId) {
                setTid(json.threadId);
                doneSeen = true;
              }
            } catch {
              /* ignore */
            }
          }
          if (doneSeen) break;
        }

        if (doneSeen) {
          // サーバー側の後処理でストリームcloseが遅れても UI を待たせない
          await reader.cancel().catch(() => {});
        }
        setStreaming("");
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`通信に失敗しました（${msg.slice(0, 120)}）`);
      } finally {
        entryOpeningInFlight.delete(entryId);
        setBusy(false);
      }
    })();
  }, [entryId, initialMessages, router, serverHasOpeningPending]);

  const panelHeight =
    variant === "compact"
      ? "min-h-[260px] max-h-[min(52dvh,440px)] landscape:max-h-[min(42dvh,320px)] md:min-h-[min(44dvh,400px)] md:max-h-[min(68dvh,560px)] lg:min-h-[min(64dvh,560px)] lg:max-h-[min(75dvh,680px)]"
      : [
          // メッセージ＋入力欄。固定ヘッダー・底ナビ・カード見出し分を calc で控えつつ、dvh/px 上限も緩める
          "min-h-[min(58dvh,420px)]",
          "max-h-[min(86dvh,min(780px,calc(100svh-8.25rem)))]",
          "landscape:max-h-[min(70dvh,min(560px,calc(100svh-7.75rem)))]",
          "md:min-h-[min(60dvh,460px)]",
          // タブレット幅はチャット縦をやや多めに（1024px 未満）
          "md:max-lg:max-h-[min(88dvh,min(840px,calc(100svh-9.5rem)))]",
          "md:landscape:max-h-[min(72dvh,min(600px,calc(100svh-9.5rem)))]",
          "lg:min-h-[min(68dvh,520px)]",
          "lg:max-h-[min(90dvh,min(900px,calc(100svh-11.5rem)))]",
        ].join(" ");

  const panelBodyClass =
    layoutHeight === "fill" && variant === "default"
      ? `flex min-h-0 flex-1 flex-col ${DEFAULT_CHAT_PANEL_MOBILE_HEIGHT} md:min-h-0 md:max-h-none md:flex-1`
      : `flex flex-col ${panelHeight}`;

  const panelShellStyle: CSSProperties | undefined = vvShellStyle ? { ...vvShellStyle, minHeight: 0 } : undefined;

  function dismissSettingsTip(messageId: string) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, settingsChangeTip: undefined } : m)));
  }

  async function revertSettingsTip(tip: SettingsChangeTip, messageId: string) {
    setSettingsUndoBusy(true);
    setError(null);
    try {
      const prev = tip.previous;
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          dayBoundaryEndTime: prev.dayBoundaryEndTime,
          profile: {
            timeZone: prev.timeZone === null || prev.timeZone === undefined ? "" : prev.timeZone,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof (json as { error?: string }).error === "string" ? (json as { error: string }).error : "設定の取り消しに失敗しました");
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      dismissSettingsTip(messageId);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("通信に失敗しました。接続やログイン状態を確認してください。");
    } finally {
      setSettingsUndoBusy(false);
    }
  }

  async function loadAndOpenTimetableEditor() {
    setTimetableBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as {
        profile?: {
          occupationRole?: string;
          studentTimetable?: string;
          workLifeAnswers?: Record<string, string>;
        };
        error?: string;
      };
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "設定の取得に失敗しました");
        return;
      }
      const profile = json.profile ?? {};
      if (profile.occupationRole !== "student") {
        setError(
          "時間割エディタは職業が「学生」のときのみ使えます。プロフィールで職業を学生に設定してから、もう一度お試しください。",
        );
        return;
      }
      const raw = profile.studentTimetable?.trim();
      setTimetableValue(raw && raw.length > 0 ? raw : serializeTimetable(emptyTimetable()));
      setTimetableStLevel(profile.workLifeAnswers?.st_level ?? "");
      setTimetableEditorOpen(true);
    } catch {
      setError("通信に失敗しました。接続やログイン状態を確認してください。");
    } finally {
      setTimetableBusy(false);
    }
  }

  async function saveTimetableFromChatDialog() {
    setTimetableBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ profile: { studentTimetable: timetableValue } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof (json as { error?: string }).error === "string"
            ? (json as { error: string }).error
            : "時間割の保存に失敗しました",
        );
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      setTimetableEditorOpen(false);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("通信に失敗しました。接続やログイン状態を確認してください。");
    } finally {
      setTimetableBusy(false);
    }
  }

  function requestCascadeDeleteUserMessage(anchorId: string) {
    setError(null);
    let snapshot: Msg[] = [];
    let removedIds: string[] = [];
    let expectedLen = 0;

    flushSync(() => {
      setMessages((prev) => {
        const i = prev.findIndex((x) => x.id === anchorId);
        if (i < 0) return prev;
        snapshot = prev;
        removedIds = prev.slice(i).map((x) => x.id);
        expectedLen = prev.length - removedIds.length;
        return prev.slice(0, i);
      });
    });

    if (removedIds.length === 0) return;

    lastDeleteAnchorIdRef.current = anchorId;
    awaitingRefreshAfterDeleteRef.current = true;

    void (async () => {
      try {
        const res = await fetch(`/api/chat-messages/${anchorId}`, { method: "DELETE" });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          removedMessageIds?: string[];
        };

        if (!res.ok) {
          awaitingRefreshAfterDeleteRef.current = false;
          lastDeleteAnchorIdRef.current = null;
          setMessages((curr) => {
            if (curr.length !== expectedLen) {
              startTransition(() => router.refresh());
              return curr;
            }
            return snapshot;
          });
          setError(
            typeof data.error === "string" ? data.error : "削除に失敗しました。表示を元に戻しました。",
          );
          return;
        }

        const serverIds = data.removedMessageIds;
        if (
          Array.isArray(serverIds) &&
          serverIds.length > 0 &&
          serverIds.length !== removedIds.length
        ) {
          awaitingRefreshAfterDeleteRef.current = false;
          lastDeleteAnchorIdRef.current = null;
        }

        startTransition(() => {
          router.refresh();
        });
      } catch {
        awaitingRefreshAfterDeleteRef.current = false;
        lastDeleteAnchorIdRef.current = null;
        setMessages((curr) => {
          if (curr.length !== expectedLen) {
            startTransition(() => router.refresh());
            return curr;
          }
          return snapshot;
        });
        setError("通信に失敗しました。表示を元に戻しました。");
      }
    })();
  }

  async function deleteThread() {
    const id = tid ?? initialThreadId;
    if (!id) return;
    const n = messages.length;
    const line1 =
      n > 0
        ? `この日の振り返りチャット（発言 ${n} 件）をすべて削除します。\n\n削除すると元に戻せません。`
        : "この日の振り返りチャット（空のスレッド）を削除します。\n\n削除すると元に戻せません。";
    if (!window.confirm(line1)) return;
    if (!window.confirm("最終確認: チャットを完全に削除してよいですか？")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat-threads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof data.error === "string" ? data.error : "スレッドの削除に失敗しました");
        return;
      }
      setMessages([]);
      setTid(null);
      router.refresh();
    } catch {
      setError("通信に失敗しました。接続やログイン状態を確認してください。");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    setStreaming("");
    setAssistantWaitHint(null);

    const optimisticUserId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: optimisticUserId, role: "user", content: text }]);

    try {
      const res = await fetch("/api/ai/orchestrator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, message: text, clientNow: new Date().toISOString() }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "チャットに失敗しました");
        setMessages((m) => m.filter((x) => x.id !== optimisticUserId));
        setInput(text);
        setAssistantWaitHint(null);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      let sseBuf = "";
      let doneUserMessageId: string | undefined;
      let doneAssistantMessageId: string | undefined;
      let doneAssistantModel: string | null | undefined;
      let doneAssistantSentAt: string | undefined;
      let triggerJournalDraft = false;
      let streamingSettingsUndo: SettingsChangeTip | undefined;
      let doneSeen = false;
      let openTimetableAfterAck = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const parts = sseBuf.split("\n");
        sseBuf = parts.pop() ?? "";
        for (const line of parts) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          try {
            const json = JSON.parse(payload) as {
              phase?: string;
              hintJa?: string;
              delta?: string;
              done?: boolean;
              threadId?: string;
              userMessageId?: string;
              assistantMessageId?: string;
              assistantModel?: string | null;
              assistantSentAt?: string;
              triggerJournalDraft?: boolean;
              settingsUndo?: SettingsChangeTip;
              navigateToEntryYmd?: string;
              openTimetableEditorAfterAck?: boolean;
              pendingSettingsSummaryJa?: string;
            };
            if (json.phase === "preparing" && typeof json.hintJa === "string" && json.hintJa.trim()) {
              setAssistantWaitHint(json.hintJa.trim());
            }
            if (json.delta) {
              setAssistantWaitHint(null);
              assistant += json.delta;
              setStreaming(assistant);
            }
            if (json.done && json.threadId) {
              setTid(json.threadId);
            }
            if (json.done) {
              doneSeen = true;
              if (typeof json.userMessageId === "string") doneUserMessageId = json.userMessageId;
              if (typeof json.assistantMessageId === "string") doneAssistantMessageId = json.assistantMessageId;
              if (json.assistantModel !== undefined) doneAssistantModel = json.assistantModel ?? null;
              if (typeof json.assistantSentAt === "string" && json.assistantSentAt.trim())
                doneAssistantSentAt = json.assistantSentAt.trim();
              if (json.triggerJournalDraft === true) triggerJournalDraft = true;
              if (json.settingsUndo?.previous && json.settingsUndo?.next) {
                streamingSettingsUndo = json.settingsUndo as SettingsChangeTip;
              }
              if (typeof json.navigateToEntryYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.navigateToEntryYmd)) {
                // settings apply may shift effective day; navigate after we append assistant
                window.setTimeout(() => {
                  router.push(`/entries/${json.navigateToEntryYmd}`);
                }, 350);
              }
              if (json.openTimetableEditorAfterAck === true) {
                openTimetableAfterAck = true;
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (doneSeen) break;
      }

      if (doneSeen) {
        // サーバー側の後処理でストリームcloseが遅れても UI を待たせない
        await reader.cancel().catch(() => {});
      }
      setMessages((m) => {
        const withRealUser = m.map((row) =>
          row.id === optimisticUserId && doneUserMessageId
            ? { ...row, id: doneUserMessageId }
            : row,
        );
        const aid = doneAssistantMessageId ?? crypto.randomUUID();
        return [
          ...withRealUser,
          {
            id: aid,
            role: "assistant",
            content: assistant,
            model: doneAssistantModel ?? null,
            sentAt: doneAssistantSentAt ?? new Date().toISOString(),
            ...(streamingSettingsUndo ? { settingsChangeTip: streamingSettingsUndo } : {}),
          },
        ];
      });
      setStreaming("");
      setAssistantWaitHint(null);
      onJournalDraftContextRefresh?.();
      if (journalDraftPlacement !== "none") {
        setJournalDraftPanelRefreshKey((k) => k + 1);
      }
      if (triggerJournalDraft) {
        if (journalDraftPlacement !== "none") {
          setJournalDraftAutoKey((k) => k + 1);
        }
        onJournalDraftGenerateRequest?.();
      }
      if (openTimetableAfterAck) {
        void loadAndOpenTimetableEditor();
      }
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("通信に失敗しました。接続やログイン状態を確認してください。");
      setMessages((m) => m.filter((x) => x.id !== optimisticUserId));
      setInput(text);
      setAssistantWaitHint(null);
    } finally {
      setBusy(false);
      setAssistantWaitHint(null);
    }
  }

  const accordionLayout = conversationAccordion && variant === "default";

  function renderMessagesAndComposer() {
    return (
      <>
        <div
          ref={messagesScrollRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 py-2 sm:space-y-2.5 sm:px-3 sm:py-3 lg:space-y-4 lg:px-4 lg:py-4"
        >
          {messages.length === 0 && !streaming && !busy && (
            <p className="rounded-xl bg-zinc-100/80 px-3 py-2 text-center text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              何もない日でも大丈夫。AI がすぐに話しかけます。気分や小さな出来事から返してみてください。
            </p>
          )}
          {messages.length === 0 && busy && (
            <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-center text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
              振り返りを始めています…
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserMessageBubble
                key={m.id}
                m={m}
                hasFollowingMessages={messages.slice(i + 1).length > 0}
                followingMessageCount={messages.slice(i + 1).length}
                onUpdated={(id, content, meta) => {
                  flushSync(() => {
                    setMessages((prev) => {
                      const idx = prev.findIndex((x) => x.id === id);
                      if (idx < 0) return prev;
                      const head = prev.slice(0, idx);
                      const updatedUser = { ...prev[idx]!, content };
                      if (meta?.editOutcome === "regenerated_tail" && meta.newAssistant) {
                        const a = meta.newAssistant;
                        return [
                          ...head,
                          updatedUser,
                          {
                            id: a.id,
                            role: "assistant",
                            content: a.content,
                            model: a.model ?? null,
                            sentAt: a.sentAt ?? null,
                          },
                        ];
                      }
                      return [...head, updatedUser, ...prev.slice(idx + 1)];
                    });
                  });
                  if (meta?.editOutcome === "regenerated_tail") {
                    startTransition(() => {
                      router.refresh();
                    });
                  }
                }}
                onRequestCascadeDelete={requestCascadeDeleteUserMessage}
              />
            ) : (
              <AssistantBubble
                key={m.id}
                content={
                  isOpeningPendingModel(m.model) && !m.content.trim()
                    ? "振り返りを準備しています…"
                    : m.content
                }
                streaming={isOpeningPendingModel(m.model) && !m.content.trim()}
                sentAtIso={m.sentAt ?? null}
                settingsChangeTip={m.settingsChangeTip}
                undoBusy={settingsUndoBusy}
                onUndoSettings={
                  m.settingsChangeTip
                    ? () => void revertSettingsTip(m.settingsChangeTip!, m.id)
                    : undefined
                }
                onDismissSettingsTip={
                  m.settingsChangeTip ? () => dismissSettingsTip(m.id) : undefined
                }
              />
            ),
          )}
          {busy &&
            !streaming &&
            messages.length > 0 &&
            messages[messages.length - 1]?.role === "user" && (
              <AssistantBubble
                content="応答を準備しています…"
                subNote={
                  assistantWaitHint ??
                  "カレンダー・天気・記憶などを参照している間、返信が始まるまで数十秒かかることがあります。"
                }
                streaming
              />
            )}
          {streaming ? <AssistantBubble content={streaming} streaming /> : null}
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/95 p-2 sm:p-2.5 lg:p-3 dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={variant === "compact" ? 2 : 2}
              className="entry-chat-compose-textarea min-h-[2.5rem] flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-900 shadow-inner outline-none ring-emerald-500/30 placeholder:text-zinc-400 focus:border-emerald-500/50 focus:ring-2 sm:min-h-[2.75rem] sm:rounded-xl sm:px-3 sm:py-2 lg:min-h-[2.75rem] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="気づいたこと、感情、今日の予定とのこと…"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // Enter / Shift+Enter は改行（textarea 既定）。送信は Mac: Option+Return / Win: Alt+Enter のみ。
                if (e.altKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={() => void send()}
              className="min-h-10 min-w-[4rem] shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40 sm:min-h-12 sm:min-w-[4.5rem] sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              送信
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <section
      className={
        layoutHeight === "fill" && variant === "default"
          ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          : [
              "overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
              conversationAccordion && variant === "default" ? "flex min-h-0 flex-col" : "",
            ]
              .filter(Boolean)
              .join(" ")
      }
    >
      <div className="shrink-0 border-b border-zinc-100 bg-zinc-50/90 px-3 py-2 sm:px-3.5 sm:py-2.5 lg:px-4 lg:py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
        {conversationAccordion && variant === "default" ? (
          <div className="flex min-w-0 flex-col gap-2 sm:gap-2.5 lg:gap-3">
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-zinc-900 sm:text-sm dark:text-zinc-50">振り返りチャット</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500 sm:text-xs">
                プロフィール・カレンダーの文脈を踏まえて深掘りします。
              </p>
            </div>
            <div className="flex flex-wrap items-stretch justify-between gap-2 border-t border-zinc-200/70 pt-2 sm:gap-3 sm:pt-3 dark:border-zinc-700/80">
              <button
                type="button"
                id="entry-chat-accordion-trigger"
                aria-expanded={conversationOpen}
                aria-controls="entry-chat-conversation-panel"
                disabled={busy}
                onClick={() => setConversationOpen((o) => !o)}
                className="inline-flex min-h-9 min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-800 shadow-sm outline-none ring-emerald-500/25 transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 disabled:opacity-50 sm:min-h-10 sm:min-w-[8.5rem] sm:gap-2 sm:px-3 sm:flex-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
              >
                {conversationOpen ? "会話を閉じる" : "会話を開く"}
              </button>
              {(tid ?? initialThreadId) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteThread()}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50/90 px-2.5 text-[11px] font-medium text-red-800 shadow-sm outline-none ring-red-500/20 transition hover:bg-red-100/90 focus-visible:ring-2 disabled:opacity-50 sm:min-h-10 sm:px-3 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-950/80"
                >
                  全削除
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2 sm:gap-3 lg:gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-semibold text-zinc-900 sm:text-sm dark:text-zinc-50">振り返りチャット</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500 sm:text-xs">
                プロフィール・カレンダーの文脈を踏まえて深掘りします。
              </p>
            </div>
            {(tid ?? initialThreadId) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void deleteThread()}
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50/90 px-2.5 text-[11px] font-medium text-red-800 shadow-sm outline-none ring-red-500/20 transition hover:bg-red-100/90 focus-visible:ring-2 disabled:opacity-50 sm:min-h-10 sm:px-3 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-950/80"
              >
                全削除
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error && (!accordionLayout || !conversationOpen) && (
        <p className="shrink-0 border-b border-red-100 bg-red-50 px-3 py-1.5 text-[11px] text-red-700 sm:px-4 sm:py-2 sm:text-xs dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {chatSecurityNoticeJa && !securityBannerDismissed && (!accordionLayout || !conversationOpen) && (
        <div className="shrink-0 border-b border-amber-200/90 bg-amber-50/95 px-3 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/50 sm:px-4 sm:py-2">
          <p className="text-[11px] leading-snug text-amber-950 sm:text-xs sm:leading-relaxed dark:text-amber-100">{chatSecurityNoticeJa}</p>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-amber-900/90 dark:text-amber-200/90">
            <button
              type="button"
              className="underline"
              onClick={() => {
                router.refresh();
              }}
            >
              最新を読み込む
            </button>
            <button type="button" className="underline" onClick={() => setSecurityBannerDismissed(true)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {pendingSettingsSummaryJa &&
        !pendingProposalDismissed &&
        (!accordionLayout || !conversationOpen) && (
          <PendingSettingsProposalBanner
            summaryJa={pendingSettingsSummaryJa}
            onDismiss={() => setPendingProposalDismissed(true)}
            onRefresh={() => router.refresh()}
          />
        )}

      {accordionLayout && conversationOpen ? (
        <ResponsiveDialog
          open={conversationOpen}
          onClose={() => setConversationOpen(false)}
          labelledBy="entry-chat-island-title"
          dialogId="entry-chat-conversation-island"
          presentation="island"
          zClass="z-[58]"
          panelClassName="min-h-0 w-full max-w-lg"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 sm:px-4 sm:py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 id="entry-chat-island-title" className="text-xs font-semibold text-zinc-900 sm:text-sm dark:text-zinc-50">
              振り返りチャット
            </h2>
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
              onClick={() => setConversationOpen(false)}
            >
              閉じる
            </button>
          </div>
          {error ? (
            <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}
          {chatSecurityNoticeJa && !securityBannerDismissed ? (
            <div className="shrink-0 border-b border-amber-200/90 bg-amber-50/95 px-4 py-2 dark:border-amber-900/40 dark:bg-amber-950/50">
              <p className="text-xs leading-relaxed text-amber-950 dark:text-amber-100">{chatSecurityNoticeJa}</p>
              <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-amber-900/90 dark:text-amber-200/90">
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    router.refresh();
                  }}
                >
                  最新を読み込む
                </button>
                <button type="button" className="underline" onClick={() => setSecurityBannerDismissed(true)}>
                  閉じる
                </button>
              </div>
            </div>
          ) : null}
          {pendingSettingsSummaryJa && !pendingProposalDismissed ? (
            <PendingSettingsProposalBanner
              summaryJa={pendingSettingsSummaryJa}
              onDismiss={() => setPendingProposalDismissed(true)}
              onRefresh={() => router.refresh()}
            />
          ) : null}
          <div
            ref={scrollRef}
            id="entry-chat-conversation-panel"
            className={[panelBodyClass, "min-h-0 min-w-0 flex-1 overflow-hidden"].join(" ")}
            style={panelShellStyle}
          >
            {renderMessagesAndComposer()}
          </div>
        </ResponsiveDialog>
      ) : null}

      {!accordionLayout ? (
        <div ref={scrollRef} className={panelBodyClass} style={panelShellStyle}>
          {renderMessagesAndComposer()}
        </div>
      ) : null}

      {journalDraftPlacement !== "none" && (tid ?? initialThreadId) && (
        <JournalDraftPanel
          entryId={entryId}
          threadId={(tid ?? initialThreadId)!}
          autoGenerateKey={journalDraftAutoKey}
          journalDraftRefreshKey={journalDraftPanelRefreshKey}
          onApplied={() => router.refresh()}
          variant="chat-footer"
        />
      )}

      <ResponsiveDialog
        open={timetableEditorOpen}
        onClose={() => {
          if (!timetableBusy) setTimetableEditorOpen(false);
        }}
        labelledBy="entry-chat-timetable-title"
        dialogId="entry-chat-timetable-dialog"
        presentation="sheetBottom"
        zClass="z-[62]"
        panelClassName="max-h-[min(92dvh,900px)] min-h-0 w-full max-w-lg"
      >
        <TimetableEditorSheetPanel
          titleId="entry-chat-timetable-title"
          title="時間割"
          value={timetableValue}
          onChange={setTimetableValue}
          stLevel={timetableStLevel}
          busy={timetableBusy}
          showSaveFooter
          onSave={() => void saveTimetableFromChatDialog()}
          onRequestClose={() => {
            if (!timetableBusy) setTimetableEditorOpen(false);
          }}
        />
      </ResponsiveDialog>
    </section>
  );
}

