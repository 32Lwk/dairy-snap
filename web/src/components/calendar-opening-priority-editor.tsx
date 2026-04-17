"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CalendarOpeningCategory } from "@/lib/user-settings";

type CatOpt = { id: CalendarOpeningCategory; label: string; custom: boolean };

/** 親の setState と組み合わせ、直前の優先配列から安全に更新する */
export type SetCalendarOpeningPriorityOrder = (
  next: CalendarOpeningCategory[] | ((prev: CalendarOpeningCategory[]) => CalendarOpeningCategory[]),
) => void;

function SortablePriorityRow({
  sortableId,
  cat,
  idx,
  catOptions,
  disabled,
  canDelete,
  onCatChange,
  onDelete,
}: {
  sortableId: string;
  cat: CalendarOpeningCategory;
  idx: number;
  catOptions: CatOpt[];
  disabled: boolean;
  canDelete: boolean;
  onCatChange: (idx: number, next: CalendarOpeningCategory) => void;
  onDelete: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50/70 p-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400"
    >
        <button
          type="button"
          className="touch-none shrink-0 cursor-grab rounded px-1 py-1.5 text-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          disabled={disabled}
          aria-label={`順序を変更（行 ${idx + 1}）`}
          title="ドラッグで並べ替え（タッチは長押しで移動）"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <span className="shrink-0 text-[11px] text-zinc-500">#{idx + 1}</span>
        <select
          value={cat}
          disabled={disabled}
          onChange={(e) => onCatChange(idx, e.target.value as CalendarOpeningCategory)}
          className="min-w-[10rem] shrink-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          aria-label={`優先順位 ${idx + 1}`}
        >
          {catOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.custom ? `${c.label}（カスタム）` : c.label}
            </option>
          ))}
        </select>
      <button
        type="button"
        disabled={disabled || !canDelete}
        title={!canDelete ? "最低1件は残してください" : "この行を削除"}
        onClick={() => onDelete(idx)}
        className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        削除
      </button>
    </div>
  );
}

export function CalendarOpeningPriorityEditor({
  priorityList,
  catOptions,
  disabled,
  onSetPriorityOrder,
}: {
  priorityList: CalendarOpeningCategory[];
  catOptions: CatOpt[];
  disabled: boolean;
  onSetPriorityOrder: SetCalendarOpeningPriorityOrder;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  );

  /** 32件上限まで。未使用カテゴリが無ければ「その他」や先頭を重複で追加（ドロップダウンで変更可） */
  const canAdd = !disabled && priorityList.length < 32 && catOptions.length > 0;

  function pickNextCategoryId(used: Set<CalendarOpeningCategory>): CalendarOpeningCategory | undefined {
    const fresh = catOptions.find((c) => !used.has(c.id))?.id;
    if (fresh) return fresh;
    return catOptions.find((c) => c.id === "other")?.id ?? catOptions[0]?.id;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = Number.parseInt(String(active.id), 10);
    const newIndex = Number.parseInt(String(over.id), 10);
    if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex)) return;
    if (oldIndex < 0 || oldIndex >= priorityList.length || newIndex < 0 || newIndex >= priorityList.length)
      return;
    onSetPriorityOrder((prio) => arrayMove(prio, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="mt-2 space-y-2">
        <SortableContext
          items={priorityList.map((_, i) => String(i))}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {priorityList.map((cat, idx) => (
              <SortablePriorityRow
                key={idx}
                sortableId={String(idx)}
                cat={cat}
                idx={idx}
                catOptions={catOptions}
                disabled={disabled}
                canDelete={priorityList.length > 1}
                onCatChange={(i, next) => {
                  onSetPriorityOrder((prio) => {
                    const cur = [...prio];
                    cur[i] = next;
                    return cur;
                  });
                }}
                onDelete={(i) => {
                  onSetPriorityOrder((prio) => {
                    const cur = [...prio];
                    cur.splice(i, 1);
                    return cur;
                  });
                }}
              />
            ))}
          </div>
        </SortableContext>
        <button
          type="button"
          disabled={disabled || !canAdd}
          title={
            !canAdd
              ? disabled
                ? undefined
                : catOptions.length === 0
                  ? "カテゴリ候補がありません"
                  : priorityList.length >= 32
                    ? "優先は最大32件までです"
                    : undefined
              : undefined
          }
          onClick={() => {
            onSetPriorityOrder((prio) => {
              if (prio.length >= 32) return prio;
              const pick = pickNextCategoryId(new Set(prio));
              if (pick === undefined) return prio;
              return [...prio, pick];
            });
          }}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          優先に含めるカテゴリを追加
        </button>
      </div>
    </DndContext>
  );
}
