"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Msg = { id: string; role: string; content: string };

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
            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
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
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">AI</span>
      <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-bl-md border border-zinc-200/80 bg-white px-4 py-2.5 text-sm leading-relaxed text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
        <p className="whitespace-pre-wrap">{content}</p>
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
}: {
  entryId: string;
  threadId: string | null;
  initialMessages: Msg[];
  variant?: "default" | "compact";
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [tid, setTid] = useState<string | null>(initialThreadId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const openingStartedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  /** 空スレッド時は AI から先に開口（振り返りを始める） */
  useEffect(() => {
    if (initialMessages.length > 0 || openingStartedRef.current) return;
    openingStartedRef.current = true;

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
          const data = (await res.json()) as { skipped?: boolean; threadId?: string };
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

        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: "assistant", content: assistant },
        ]);
        setStreaming("");
        router.refresh();
      } finally {
        setBusy(false);
      }
    })();
  }, [entryId, initialMessages.length, router]);

  const panelHeight =
    variant === "compact"
      ? "min-h-[260px] max-h-[min(52vh,440px)] lg:min-h-[min(64vh,560px)] lg:max-h-[min(75vh,680px)]"
      : "min-h-[min(48vh,380px)] max-h-[min(70vh,620px)] lg:min-h-[min(68vh,520px)] lg:max-h-[min(82vh,760px)]";

  async function deleteThread() {
    const id = tid ?? initialThreadId;
    if (!id) return;
    if (!window.confirm("このチャットスレッドと全メッセージを削除しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat-threads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("スレッドの削除に失敗しました");
        return;
      }
      setMessages([]);
      setTid(null);
      router.refresh();
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
              className="shrink-0 text-[11px] text-red-600 underline dark:text-red-400"
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

      <div ref={scrollRef} className={`flex flex-col ${panelHeight}`}>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
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
              <AssistantBubble key={m.id} content={m.content} />
            ),
          )}
          {streaming && <AssistantBubble content={streaming} streaming />}
          <div ref={bottomRef} />
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
              className="shrink-0 self-end rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              送信
            </button>
          </div>
        </div>
      </div>

      {(tid ?? initialThreadId) && (
        <DraftPanel
          entryId={entryId}
          threadId={(tid ?? initialThreadId)!}
          onApplied={() => router.refresh()}
        />
      )}
    </section>
  );
}

function DraftPanel({
  entryId,
  threadId,
  onApplied,
}: {
  entryId: string;
  threadId: string;
  onApplied: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
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
      onApplied();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI 日記（草案）</h3>
      <p className="mt-1 text-[11px] text-zinc-500">プレビュー後に本文へ反映（AI 日記セクション）。誤記録防止のため自動では書き込みません。</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void generate()}
        className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950"
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
