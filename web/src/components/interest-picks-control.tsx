"use client";

import { useState } from "react";
import { INTEREST_CATEGORIES } from "@/lib/interest-taxonomy";

export function InterestPicksControl({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [catId, setCatId] = useState(INTEREST_CATEGORIES[0]?.id ?? "music");
  const category = INTEREST_CATEGORIES.find((c) => c.id === catId) ?? INTEREST_CATEGORIES[0];

  function toggle(subId: string) {
    if (value.includes(subId)) {
      onChange(value.filter((x) => x !== subId));
    } else {
      onChange([...value, subId]);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        大分類を選ぶと、関連する小分類が表示されます。複数選択できます。
      </p>
      <div className="flex flex-wrap gap-1.5">
        {INTEREST_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCatId(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              catId === c.id
                ? "bg-emerald-600 text-white dark:bg-emerald-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {category?.subs.map((s) => {
          const on = value.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                on
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="text-[11px] text-zinc-500">
          選択中: {value.length} 件（保存時にプロフィールへ反映）
        </p>
      )}
    </div>
  );
}
