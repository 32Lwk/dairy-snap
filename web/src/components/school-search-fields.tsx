"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { PREFECTURE_OPTIONS } from "@/lib/onboarding-work-life";

/** オンボーディングの先読みと UI で共通（`st_level` → 学校種別コード） */
export function schoolKindsFromStLevel(stLevel: string): string[] {
  const lv = stLevel.trim();
  if (lv === "jh") return ["C1"];
  if (lv === "hs") return ["D1"];
  if (lv === "tech") return ["G1"];
  if (lv === "jun_col") return ["F2"];
  if (lv === "univ") return ["F1"];
  return [];
}

/**
 * 学校名画面の直前に呼ぶと `/api/schools` のコンパイル・HTTP キャッシュを先に温める。
 * 種別が1つに決まっているときのみ（全国閲覧と同じクエリ）。
 */
export function prefetchSchoolSearchCandidates(stLevel: string): void {
  const kinds = schoolKindsFromStLevel(stLevel);
  if (kinds.length !== 1) return;
  const params = new URLSearchParams();
  params.set("kind", kinds.join(","));
  params.set("limit", "80");
  void fetch(`/api/schools?${params.toString()}`, { credentials: "same-origin" });
}

export type SchoolSearchHit = {
  id: string;
  name: string;
  prefecture: string;
  city: string;
  kind?: string;
};

type Props = {
  /** `st_level` の値（学校種別フィルタ用） */
  stLevel: string;
  selected: SchoolSearchHit | null;
  manual: string;
  onSelectedChange: (v: SchoolSearchHit | null) => void;
  onManualChange: (v: string) => void;
  /** チャット下部のコンパクト行に合わせる */
  compact?: boolean;
};

export function SchoolSearchFields({
  stLevel,
  selected,
  manual,
  onSelectedChange,
  onManualChange,
  compact = false,
}: Props) {
  const [schoolPref, setSchoolPref] = useState("");
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolHits, setSchoolHits] = useState<SchoolSearchHit[]>([]);

  const schoolKinds = useMemo(() => schoolKindsFromStLevel(stLevel), [stLevel]);
  const prefectureSelectOptions = useMemo(
    () => PREFECTURE_OPTIONS.filter((o) => o.value && o.value !== "国外"),
    [],
  );

  useLayoutEffect(() => {
    const pref = schoolPref.trim();
    const q = schoolQuery.trim();
    const nationalBrowse = !pref && !q && schoolKinds.length === 1;
    const nationalOneCharOk = !pref && q.length === 1 && schoolKinds.length === 1;
    if (!pref && q.length < 2 && !nationalBrowse && !nationalOneCharOk) {
      setSchoolHits([]);
      return;
    }

    const ac = new AbortController();
    const params = new URLSearchParams();
    if (pref) params.set("pref", pref);
    if (q) params.set("q", q.slice(0, 40));
    if (schoolKinds.length > 0) params.set("kind", schoolKinds.join(","));
    params.set("limit", "80");
    const url = `/api/schools?${params.toString()}`;

    type SchoolsJson = { schools?: SchoolSearchHit[] };

    const run = () => {
      void fetch(url, { signal: ac.signal })
        .then((r) => r.json())
        .then((d: SchoolsJson) => {
          setSchoolHits(Array.isArray(d.schools) ? d.schools : []);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setSchoolHits([]);
        });
    };

    if ((pref && !q) || nationalBrowse) {
      run();
      return () => ac.abort();
    }

    const tid = window.setTimeout(run, 50);
    return () => {
      window.clearTimeout(tid);
      ac.abort();
    };
  }, [schoolQuery, schoolPref, schoolKinds]);

  const rowWrap = compact
    ? "rounded-md border border-zinc-200 bg-zinc-50/90 px-1.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50"
    : "rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40";
  const selectCls = compact
    ? "box-border h-7 w-full min-w-0 max-w-full rounded border border-zinc-200 bg-white px-1 py-0 text-[11px] leading-tight dark:border-zinc-700 dark:bg-zinc-950"
    : "mt-0.5 box-border w-full min-w-0 max-w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const inputCls = compact
    ? "box-border h-7 w-full min-w-0 max-w-full rounded border border-zinc-200 bg-white px-1.5 py-0 text-[11px] dark:border-zinc-700 dark:bg-zinc-950"
    : "mt-0.5 box-border w-full min-w-0 max-w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const labelSpan = compact
    ? "text-[10px] leading-none text-zinc-500 dark:text-zinc-400"
    : "text-xs text-zinc-600 dark:text-zinc-400";

  const showHits = schoolHits.length > 0 && !selected;
  const showNoHit =
    schoolQuery.trim().length > 0 &&
    schoolHits.length === 0 &&
    (schoolPref || schoolKinds.length === 1 || schoolQuery.trim().length >= 2);

  return (
    <div className="min-h-0 min-w-0 max-w-full space-y-1.5 overflow-x-hidden">
      <div className={`min-w-0 max-w-full ${rowWrap}`}>
        <div
          className={
            compact
              ? "flex min-w-0 w-full flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-end"
              : "grid min-w-0 max-w-full gap-3 sm:grid-cols-2"
          }
        >
          <label
            className={
              compact
                ? "flex min-w-0 w-full flex-col gap-0 sm:w-auto sm:max-w-full sm:basis-[8rem] sm:shrink-0"
                : "flex min-w-0 flex-col gap-0.5"
            }
          >
            <span className={labelSpan}>都道府県</span>
            <select
              value={schoolPref}
              onChange={(e) => {
                setSchoolPref(e.target.value);
                onSelectedChange(null);
              }}
              className={selectCls}
            >
              <option value="">未選択</option>
              {prefectureSelectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label
            className={
              compact
                ? "flex min-w-0 w-full flex-col gap-0 sm:min-w-0 sm:flex-1"
                : "flex min-w-0 flex-col gap-0.5"
            }
          >
            <span className={labelSpan}>学校名で絞り込み</span>
            <input
              value={schoolQuery}
              onChange={(e) => {
                setSchoolQuery(e.target.value);
                onSelectedChange(null);
              }}
              placeholder={
                schoolPref
                  ? "例: 向陽、附属…"
                  : schoolKinds.length === 1
                    ? "空でも候補表示・1文字から可"
                    : "全国は2文字以上（例: 早稲田）"
              }
              className={inputCls}
            />
          </label>
        </div>
      </div>

      {selected && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <div className="min-w-0 flex-1">
            <span className="font-medium">選択中</span>: {selected.name}
            {selected.kind ? `（${selected.kind}）` : ""}
            <span className="mt-0.5 block text-[11px] opacity-90">
              {selected.prefecture}
              {selected.city ? ` · ${selected.city}` : ""}
            </span>
          </div>
          <button
            type="button"
            aria-label="選択を解除"
            onClick={() => onSelectedChange(null)}
            className="shrink-0 rounded-md border border-emerald-300/80 bg-white/80 px-2 py-0.5 text-sm leading-none text-emerald-900 hover:bg-white dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-100 dark:hover:bg-emerald-900"
          >
            ×
          </button>
        </div>
      )}

      {showHits && (
        <div className="min-h-0 min-w-0 max-w-full shrink-0">
          <p
            className={
              compact
                ? "mb-0.5 text-[10px] font-medium leading-tight text-zinc-600 dark:text-zinc-300"
                : "mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300"
            }
          >
            候補から選ぶ（タップ）
          </p>
          <ul
            className={
              compact
                ? "max-h-28 min-h-0 min-w-0 max-w-full shrink-0 divide-y divide-zinc-100 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-950"
                : "max-h-32 min-h-0 min-w-0 max-w-full shrink-0 divide-y divide-zinc-100 overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-950"
            }
          >
            {schoolHits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectedChange(h);
                  }}
                  className={
                    compact
                      ? "w-full min-w-0 break-words px-2 py-1.5 text-left text-[11px] leading-snug transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      : "w-full min-w-0 break-words px-3 py-2 text-left text-sm leading-snug transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{h.name}</span>
                  {h.kind ? (
                    <span className="ml-2 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      {h.kind}
                    </span>
                  ) : null}
                  <span className="mt-px block text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                    {h.prefecture}
                    {h.city ? ` · ${h.city}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNoHit && (
        <p
          className={
            compact ? "text-[10px] leading-snug text-zinc-500 dark:text-zinc-400" : "text-xs text-zinc-500 dark:text-zinc-400"
          }
        >
          この条件では見つかりませんでした。検索語を変えるか、下の欄に学校名を入力してください。
        </p>
      )}

      <div className="min-w-0 max-w-full">
        <p
          className={
            compact
              ? "mb-0.5 text-[10px] font-medium leading-tight text-zinc-600 dark:text-zinc-300"
              : "mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300"
          }
        >
          一覧にない・国外など（任意）
        </p>
        <input
          value={manual}
          onChange={(e) => {
            onManualChange(e.target.value);
            if (e.target.value.trim()) onSelectedChange(null);
          }}
          placeholder="学校名をそのまま入力"
          className={
            compact
              ? "w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] leading-snug dark:border-zinc-700 dark:bg-zinc-950"
              : "mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          }
        />
      </div>
    </div>
  );
}
