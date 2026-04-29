"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ResponsiveDialog } from "@/components/responsive-dialog";
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

type Msg = { id: string; role: string; content: string; model?: string | null };

/** デフォルト高さ（`layoutHeight="fill"` のモバイル時のみ max-md: で利用） */
const DEFAULT_CHAT_PANEL_MOBILE_HEIGHT =
  "max-md:min-h-[min(58dvh,420px)] max-md:max-h-[min(84dvh,min(780px,calc(100svh-10rem)))] max-md:landscape:max-h-[min(68dvh,min(560px,calc(100svh-9rem)))]";

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

function UserMessageBubble({
  m,
  onUpdated,
  onDeleted,
  hasFollowingMessages,
}: {
  m: Msg;
  onUpdated: (
    id: string,
    content: string,
    meta?: {
      editOutcome?: "kept_tail" | "regenerated_tail";
      newAssistant?: { id: string; role: string; content: string; model?: string | null };
    },
  ) => void;
  onDeleted: (id: string) => void;
  /** この発言のあとにメッセージがあるときだけ「再実行 / 再実行しない」を出す */
  hasFollowingMessages: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const [busy, setBusy] = useState(false);
  /** PATCH 送信中の種別（ボタンラベル用） */
  const [pendingAction, setPendingAction] = useState<null | "keep" | "regenerate">(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        newAssistant?: { id: string; role: string; content: string; model?: string | null };
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

  async function remove() {
    if (!window.confirm("この発言を削除しますか？")) return;
    flushSync(() => {
      setBusy(true);
    });
    try {
      const res = await fetch(`/api/chat-messages/${m.id}`, { method: "DELETE" });
      if (!res.ok) return;
      onDeleted(m.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">あなた</span>
      <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-gradient-to-br from-zinc-800 to-zinc-900 px-4 py-2.5 text-sm text-white shadow-sm dark:from-zinc-200 dark:to-zinc-100 dark:text-zinc-900">
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
              <button type="button" disabled={busy} onClick={() => void remove()} className="underline">
                削除
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({ content, streaming }: { content: string; streaming?: boolean }) {
  const shown = stripLightMarkdownForChatDisplay(stripAssistantMetaEchoPrefix(content));
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">AI</span>
      <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-bl-md border border-zinc-200/80 bg-white px-4 py-2.5 text-sm leading-relaxed text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
        <p className="whitespace-pre-wrap">{shown}</p>
        {streaming && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-emerald-500 align-middle" />}
      </div>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [securityBannerDismissed, setSecurityBannerDismissed] = useState(false);
  const [journalDraftAutoKey, setJournalDraftAutoKey] = useState(0);
  const [journalDraftPanelRefreshKey, setJournalDraftPanelRefreshKey] = useState(0);
  const [conversationOpen, setConversationOpen] = useState(!conversationAccordion);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const vvShellStyle = useVisualViewportKeyboardMaxHeight();

  useEffect(() => {
    setConversationOpen(!conversationAccordion);
  }, [conversationAccordion, entryId, initialThreadId]);

  useEffect(() => {
    if (busy || streaming) return;
    setMessages(initialMessages);
  }, [initialMessages, busy, streaming]);

  useEffect(() => {
    setSecurityBannerDismissed(false);
  }, [chatSecurityNoticeJa, initialThreadId]);

  useEffect(() => {
    onThreadIdChange?.(tid);
  }, [tid, onThreadIdChange]);

  useEffect(() => {
    setJournalDraftPanelRefreshKey(0);
  }, [entryId, initialThreadId]);

  // Keep autoscroll inside the message pane only (`scrollIntoView` can scroll the window).
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
    if (hasRealExchange || serverHasOpeningPending || entryOpeningInFlight.has(entryId)) return;
    entryOpeningInFlight.add(entryId);

    void (async () => {
      setError(null);
      setBusy(true);
      setStreaming("");
      try {
        const res = await fetch("/api/ai/chat/opening", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId, clientNow: new Date().toISOString() }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(typeof data.error === "string" ? data.error : "開口メッセージの取得に失敗しました");
          return;
        }
        if (ct.includes("application/json")) {
          const data = (await res.json()) as {
            skipped?: boolean;
            threadId?: string;
            openingInProgress?: boolean;
          };
          if (data.skipped && data.threadId) {
            setTid(data.threadId);
            router.refresh();
          }
          return;
        }
        if (!res.body) {
          setError("開口メッセージの取得に失敗しました");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistant = "";
        let sseBuf = "";

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
              }
            } catch {
              /* ignore */
            }
          }
        }

        setStreaming("");
        router.refresh();
      } catch {
        setError("通信に失敗しました。接続やログイン状態を確認してください。");
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
          "max-h-[min(84dvh,min(780px,calc(100svh-10rem)))]",
          "landscape:max-h-[min(68dvh,min(560px,calc(100svh-9rem)))]",
          "md:min-h-[min(60dvh,460px)]",
          "md:max-h-[min(86dvh,min(820px,calc(100svh-11rem)))]",
          "md:landscape:max-h-[min(72dvh,min(600px,calc(100svh-9.5rem)))]",
          "lg:min-h-[min(68dvh,520px)]",
          "lg:max-h-[min(90dvh,min(900px,calc(100svh-11.5rem)))]",
        ].join(" ");

  const panelBodyClass =
    layoutHeight === "fill" && variant === "default"
      ? `flex min-h-0 flex-1 flex-col ${DEFAULT_CHAT_PANEL_MOBILE_HEIGHT} md:min-h-0 md:max-h-none md:flex-1`
      : `flex flex-col ${panelHeight}`;

  const panelShellStyle: CSSProperties | undefined = vvShellStyle ? { ...vvShellStyle, minHeight: 0 } : undefined;

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

    const optimisticUserId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: optimisticUserId, role: "user", content: text }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, message: text, clientNow: new Date().toISOString() }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "チャットに失敗しました");
        setMessages((m) => m.filter((x) => x.id !== optimisticUserId));
        setInput(text);
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
      let triggerJournalDraft = false;

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
              delta?: string;
              done?: boolean;
              threadId?: string;
              userMessageId?: string;
              assistantMessageId?: string;
              assistantModel?: string | null;
              triggerJournalDraft?: boolean;
            };
            if (json.delta) {
              assistant += json.delta;
              setStreaming(assistant);
            }
            if (json.done && json.threadId) {
              setTid(json.threadId);
            }
            if (json.done) {
              if (typeof json.userMessageId === "string") doneUserMessageId = json.userMessageId;
              if (typeof json.assistantMessageId === "string") doneAssistantMessageId = json.assistantMessageId;
              if (json.assistantModel !== undefined) doneAssistantModel = json.assistantModel ?? null;
              if (json.triggerJournalDraft === true) triggerJournalDraft = true;
            }
          } catch {
            /* ignore */
          }
        }
      }

      setMessages((m) => {
        const withRealUser = m.map((row) =>
          row.id === optimisticUserId && doneUserMessageId
            ? { ...row, id: doneUserMessageId }
            : row,
        );
        return [
          ...withRealUser,
          {
            id: doneAssistantMessageId ?? crypto.randomUUID(),
            role: "assistant",
            content: assistant,
            model: doneAssistantModel ?? null,
          },
        ];
      });
      setStreaming("");
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
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("通信に失敗しました。接続やログイン状態を確認してください。");
      setMessages((m) => m.filter((x) => x.id !== optimisticUserId));
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  const accordionLayout = conversationAccordion && variant === "default";

  function renderMessagesAndComposer() {
    return (
      <>
        <div
          ref={messagesScrollRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
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
                onDeleted={(id) => {
                  setMessages((prev) => prev.filter((x) => x.id !== id));
                  startTransition(() => {
                    router.refresh();
                  });
                }}
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
              />
            ),
          )}
          {streaming && <AssistantBubble content={streaming} streaming />}
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/95 p-3 dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={variant === "compact" ? 2 : 3}
              className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 shadow-inner outline-none ring-emerald-500/30 placeholder:text-zinc-400 focus:border-emerald-500/50 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="気づいたこと、感情、今日の予定とのこと…"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={() => void send()}
              className="min-h-12 min-w-[4.5rem] shrink-0 self-end rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-600"
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
          ? "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          : [
              "overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950",
              conversationAccordion && variant === "default" ? "flex min-h-0 flex-col" : "",
            ]
              .filter(Boolean)
              .join(" ")
      }
    >
      <div className="shrink-0 border-b border-zinc-100 bg-zinc-50/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
        {conversationAccordion && variant === "default" ? (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">振り返りチャット</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                AI が先に声をかけます。プロフィール・カレンダー（連携時）の文脈を踏まえて深掘りします（ストリーミング / 1日50通まで）
              </p>
            </div>
            <div className="flex flex-wrap items-stretch justify-between gap-3 border-t border-zinc-200/70 pt-3 dark:border-zinc-700/80">
              <button
                type="button"
                id="entry-chat-accordion-trigger"
                aria-expanded={conversationOpen}
                aria-controls="entry-chat-conversation-panel"
                disabled={busy}
                onClick={() => setConversationOpen((o) => !o)}
                className="inline-flex min-h-10 min-w-[8.5rem] flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-medium text-zinc-800 shadow-sm outline-none ring-emerald-500/25 transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 disabled:opacity-50 sm:flex-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
              >
                {conversationOpen ? "会話を閉じる" : "会話を開く"}
              </button>
              {(tid ?? initialThreadId) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteThread()}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50/90 px-3 text-[11px] font-medium text-red-800 shadow-sm outline-none ring-red-500/20 transition hover:bg-red-100/90 focus-visible:ring-2 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-950/80"
                >
                  全削除
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">振り返りチャット</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                AI が先に声をかけます。プロフィール・カレンダー（連携時）の文脈を踏まえて深掘りします（ストリーミング / 1日50通まで）
              </p>
            </div>
            {(tid ?? initialThreadId) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void deleteThread()}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50/90 px-3 text-[11px] font-medium text-red-800 shadow-sm outline-none ring-red-500/20 transition hover:bg-red-100/90 focus-visible:ring-2 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-950/80"
              >
                全削除
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error && (!accordionLayout || !conversationOpen) && (
        <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {chatSecurityNoticeJa && !securityBannerDismissed && (!accordionLayout || !conversationOpen) && (
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
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 id="entry-chat-island-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
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
    </section>
  );
}

