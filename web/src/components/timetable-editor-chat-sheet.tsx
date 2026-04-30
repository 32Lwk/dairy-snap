"use client";

import { ResponsiveDialog } from "@/components/responsive-dialog";
import { TimetableEditor } from "@/components/timetable-editor";

type TimetableEditorChatSheetProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  /** `aria-labelledby` 用（見出し要素の id と一致させる） */
  labelledBy: string;
  dialogId?: string;
  title?: string;
  value: string;
  onValueChange: (next: string) => void;
  stLevel: string;
  busy: boolean;
  onSave: () => void | Promise<void>;
  saveLabel?: string;
  savingLabel?: string;
};

/**
 * 振り返りチャットなどから時間割を編集するときの下シート（設定 API 保存は親の onSave）。
 */
export function TimetableEditorChatSheet({
  open,
  onOpenChange,
  labelledBy,
  dialogId = "timetable-editor-chat-sheet",
  title = "時間割",
  value,
  onValueChange,
  stLevel,
  busy,
  onSave,
  saveLabel = "保存",
  savingLabel = "保存しています…",
}: TimetableEditorChatSheetProps) {
  return (
    <ResponsiveDialog
      open={open}
      onClose={() => {
        if (!busy) onOpenChange(false);
      }}
      labelledBy={labelledBy}
      dialogId={dialogId}
      presentation="sheetBottom"
      zClass="z-[62]"
      panelClassName="max-h-[min(92dvh,900px)] min-h-0 w-full max-w-lg"
    >
      <div className="flex max-h-[inherit] min-h-0 flex-col overflow-hidden bg-white dark:bg-zinc-950">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id={labelledBy} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
            onClick={() => {
              if (!busy) onOpenChange(false);
            }}
          >
            閉じる
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <TimetableEditor compact value={value} onChange={onValueChange} stLevel={stLevel} />
        </div>
        <div className="shrink-0 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            {busy ? savingLabel : saveLabel}
          </button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
