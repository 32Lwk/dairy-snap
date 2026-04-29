"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  ABROAD_COUNTRY_OPTIONS,
  prefectureChipSuggestions,
  type WorkLifeOption,
} from "@/lib/onboarding-work-life";
import { FancySelect } from "@/components/fancy-select";

const chipBase =
  "rounded-lg border px-2.5 py-1 text-left text-xs font-medium transition";
const chipOff =
  "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";
const chipOn =
  "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100";

/** セレクトの「選ばない」以外とチップ候補が同じ集合なら、セレクトは省略してよい */
function chipsMatchSelectBody(
  chipOpts: WorkLifeOption[],
  selectOptions: WorkLifeOption[],
): boolean {
  const sel = selectOptions.filter((o) => o.value);
  if (chipOpts.length === 0 || sel.length === 0) return false;
  if (chipOpts.length !== sel.length) return false;
  const a = new Set(chipOpts.map((c) => c.value));
  for (const o of sel) {
    if (!a.has(o.value)) return false;
  }
  return true;
}

export type PrefecturePickQuestionId = "st_home_pref" | "hi_origin_pref" | "hi_home_pref";

type Props = {
  questionId: PrefecturePickQuestionId;
  workAnswers: Record<string, string>;
  value: string;
  onChange: (value: string) => void;
  selectOptions: WorkLifeOption[];
  /** フィールド見出し。チャット下部では未使用のため省略可 */
  label?: ReactNode;
  inputCls: string;
};

/**
 * オンボーディングチャットと同じ: 都道府県の候補チップ + 説明文 + セレクト
 */
export function PrefecturePickWithChips({
  questionId,
  workAnswers,
  value,
  onChange,
  selectOptions,
  label,
  inputCls,
}: Props) {
  const isAbroadOrigin = questionId === "hi_origin_pref" && workAnswers.hi_origin === "abroad";
  const isHomePref = questionId === "hi_home_pref";

  const countryOpts = useMemo(() => {
    const v = value.trim();
    if (v && !ABROAD_COUNTRY_OPTIONS.some((o) => o.value === v)) {
      return [{ value: v, label: `${v}（保存済み）` }, ...ABROAD_COUNTRY_OPTIONS.slice(1)];
    }
    return ABROAD_COUNTRY_OPTIONS;
  }, [value]);

  const chipOpts = useMemo(
    () => prefectureChipSuggestions(questionId, workAnswers),
    [questionId, workAnswers],
  );

  const hideSelectAsDuplicate = chipsMatchSelectBody(chipOpts, selectOptions);
  /** hi_home_pref はチップが出身県ベースのため、未入力時は空。全国セレクトは常に必要。 */
  const showNationwideSelect = isHomePref || !hideSelectAsDuplicate;

  if (isAbroadOrigin) {
    return (
      <div className="space-y-2">
        {label != null && label !== false ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            育ちに近い国はどれですか？（任意）
          </p>
        ) : null}
        <FancySelect value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {countryOpts.map((o) => (
            <option key={o.value || "empty"} value={o.value}>
              {o.label}
            </option>
          ))}
        </FancySelect>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          国内の都道府県ではなく、国名を選んでください。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label != null && label !== false ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{label}</p>
      ) : null}
      {isHomePref && chipOpts.length === 0 ? (
        <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          出身県を選ぶと、近い都道府県が上にチップでも出ます。いまは下の一覧から選べます。
        </p>
      ) : null}
      {chipOpts.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">候補（タップで反映）</p>
          <div className="flex flex-wrap gap-1.5">
            {chipOpts.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={`${chipBase} ${value === o.value ? chipOn : chipOff}`}
              >
                {o.label}
              </button>
            ))}
            {hideSelectAsDuplicate || isHomePref ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className={`${chipBase} ${value === "" ? chipOn : chipOff}`}
              >
                選ばない
              </button>
            ) : null}
          </div>
          {isHomePref ? null : (
            <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
              {questionId === "hi_origin_pref"
                ? hideSelectAsDuplicate
                  ? "上で選んだ広域に含まれる都道府県のみです。「選ばない」でクリアできます。"
                  : "チップと下の一覧は、上で選んだ広域に含まれる都道府県のみです。"
                : "一覧は全国固定順（北海道から）です。候補にない場合は下から選べます。"}
            </p>
          )}
        </div>
      ) : null}
      {showNationwideSelect ? (
        <>
          <FancySelect value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
            {selectOptions.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </FancySelect>
          {isHomePref ? (
            <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
              一覧は全国固定順です。出身県と同じなら、上のチップからも選べます。
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
