"use client";

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { TimetableEditor } from "@/components/timetable-editor";

export type TimetableEditorSheetPanelProps = {
  titleId: string;
  title: string;
  value: string;
  onChange: (next: string) => void;
  stLevel: string;
  busy?: boolean;
  /** チャットの時間割保存など。false のときは onChange のみ（オンボーディング同期） */
  showSaveFooter?: boolean;
  onSave?: () => void | Promise<void>;
  onRequestClose: () => void;
  /** IME／モバイルキーボード周りの誤操作で親を閉じないためのラップ（オンボーディング用） */
  interactionGuard?: boolean;
  /** `interactionGuard` 時、親のバックドロップ誤閉じ判定と同期（ポータルオーバーレイ用） */
  guardTimestampRefs?: {
    blurAt: MutableRefObject<number | null>;
    interactAt: MutableRefObject<number | null>;
  };
  /** ヘッダー右の閉じるボタンの見た目（チャットは枠付き、プロフィールはフラット） */
  closeButtonClassName?: string;
  /** ルートのラッパー（チャットは bg-white 列、ポータルは親が付与） */
  className?: string;
  children?: ReactNode;
};

/**
 * 時間割フルシートの中身（ヘッダー・スクロール・TimetableEditor・任意の保存フッタ）。
 * `ResponsiveDialog` や `createPortal` の外枠は親が持つ。
 */
export function TimetableEditorSheetPanel({
  titleId,
  title,
  value,
  onChange,
  stLevel,
  busy = false,
  showSaveFooter = true,
  onSave,
  onRequestClose,
  interactionGuard = false,
  guardTimestampRefs,
  closeButtonClassName = "rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200",
  className = "flex max-h-[inherit] min-h-0 flex-col overflow-hidden bg-white dark:bg-zinc-950",
  children,
}: TimetableEditorSheetPanelProps) {
  const fallbackBlurRef = useRef<number | null>(null);
  const fallbackInteractRef = useRef<number | null>(null);
  const blurRef = guardTimestampRefs?.blurAt ?? fallbackBlurRef;
  const interactRef = guardTimestampRefs?.interactAt ?? fallbackInteractRef;
  const [blurAt, setBlurAt] = useState<number | null>(null);
  const [interactAt, setInteractAt] = useState<number | null>(null);

  useEffect(() => {
    if (blurAt == null) return;
    blurRef.current = blurAt;
  }, [blurAt, blurRef]);

  useEffect(() => {
    if (interactAt == null) return;
    interactRef.current = interactAt;
  }, [interactAt, interactRef]);

  const editor = (
    <TimetableEditor compact value={value} onChange={onChange} stLevel={stLevel} />
  );

  const editorBlock = interactionGuard ? (
    <div
      onBlurCapture={() => {
        setBlurAt(Date.now());
      }}
      onFocusCapture={() => {
        setInteractAt(Date.now());
      }}
      onKeyDownCapture={() => {
        setInteractAt(Date.now());
      }}
      onPointerDownCapture={() => {
        setInteractAt(Date.now());
      }}
    >
      {editor}
    </div>
  ) : (
    editor
  );

  return (
    <div className={className}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <button
          type="button"
          disabled={busy}
          className={closeButtonClassName}
          onClick={() => {
            if (!busy) onRequestClose();
          }}
        >
          閉じる
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {editorBlock}
      </div>
      {showSaveFooter ? (
        <div className="shrink-0 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave?.()}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            {busy ? "保存しています…" : "保存"}
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
