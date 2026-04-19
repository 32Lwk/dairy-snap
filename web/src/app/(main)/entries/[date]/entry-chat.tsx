"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { isOpeningPendingModel } from "@/lib/opening-pending";
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
}: {
  m: Msg;
  onUpdated: (id: string, content: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setText(m.content);
  }, [m.id, m.content]);

  async function save() {
    const next = text.trim();
    if (!next || next === m.content) {
      setEditing(false);
      setText(m.content);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/chat-messages/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: next }),
      });
      if (!res.ok) {
        return;
      }
      onUpdated(m.id, next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("この発言を削除しますか？")) return;
    setBusy(true);
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
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setText(m.content);
                }}
                className="text-xs text-white/80 underline dark:text-zinc-700"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-white/20 px-2 py-1 text-xs font-medium dark:bg-zinc-900 dark:text-zinc-100"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap leading-relaxed">{stripLightMarkdownForChatDisplay(m.content)}</p>
            <div className="mt-1.5 flex justify-end gap-3 text-[11px] text-white/70 dark:text-zinc-600">
              <button type="button" disabled={busy} onClick={() => setEditing(true)} className="underline">
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
  const shown = stripLightMarkdownForChatDisplay(content);
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
}: {
  entryId: string;
  threadId: string | null;
  initialMessages: Msg[];
  variant?: "default" | "compact";
  journalDraftPlacement?: "below-chat" | "none";
  onThreadIdChange?: (threadId: string | null) => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [tid, setTid] = useState<string | null>(initialThreadId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const vvShellStyle = useVisualViewportKeyboardMaxHeight();

  useEffect(() => {
    if (busy || streaming) return;
    setMessages(initialMessages);
  }, [initialMessages, busy, streaming]);

  useEffect(() => {
    onThreadIdChange?.(tid);
  }, [tid, onThreadIdChange]);

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
          body: JSON.stringify({ entryId }),
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
      : "min-h-[min(48dvh,380px)] max-h-[min(70dvh,620px)] landscape:max-h-[min(55dvh,480px)] md:min-h-[min(52dvh,420px)] md:max-h-[min(76dvh,680px)] md:landscape:max-h-[min(62dvh,540px)] lg:min-h-[min(68dvh,520px)] lg:max-h-[min(82dvh,760px)]";
  const panelShellStyle: CSSProperties | undefined = vvShellStyle ? { ...vvShellStyle, minHeight: 0 } : undefined;

  async function deleteThread() {
    const id = tid ?? initialThreadId;
    if (!id) return;
    if (!window.confirm("このチャットスレッドと全メッセージを削除しますか？")) return;
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

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, message: text }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "チャットに失敗しました");
        setBusy(false);
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

      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", content: text },
        { id: crypto.randomUUID(), role: "assistant", content: assistant },
      ]);
      setStreaming("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-100 bg-zinc-50/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">振り返りチャット</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              AI が先に声をかけます。プロフィール・カレンダー（連携時）の文脈を踏まえて深掘りします（ストリーミング / 1日50通まで）
            </p>
          </div>
          {(tid ?? initialThreadId) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteThread()}
              className="min-h-10 shrink-0 px-1 text-[11px] text-red-600 underline dark:text-red-400"
            >
              全削除
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div ref={scrollRef} className={`flex flex-col ${panelHeight}`} style={panelShellStyle}>
        <div
          ref={messagesScrollRef}
          className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
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
          {messages.map((m) =>
            m.role === "user" ? (
              <UserMessageBubble
                key={m.id}
                m={m}
                onUpdated={(id, content) => {
                  setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, content } : x)));
                  router.refresh();
                }}
                onDeleted={(id) => {
                  setMessages((prev) => prev.filter((x) => x.id !== id));
                  router.refresh();
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

        <div className="border-t border-zinc-100 bg-zinc-50/95 p-3 dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={variant === "compact" ? 2 : 3}
              className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-inner outline-none ring-emerald-500/30 placeholder:text-zinc-400 focus:border-emerald-500/50 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
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
      </div>

      {journalDraftPlacement !== "none" && (tid ?? initialThreadId) && (
        <JournalDraftPanel
          entryId={entryId}
          threadId={(tid ?? initialThreadId)!}
          onApplied={() => router.refresh()}
          variant="chat-footer"
        />
      )}
    </section>
  );
}

