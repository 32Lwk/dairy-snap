"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  addCustomColumn,
  appendMissingStdWeekdays,
  appendNextWeekendColumn,
  duplicatePatternStructure,
  effectiveDurationMin,
  emptyTimetable,
  HS_SUBJECT_CHIPS,
  parseTimetableStored,
  serializeTimetable,
  STD_WEEK_LABELS,
  useHighSchoolSubjectPalette,
  type TimetableBundle,
  type TimetablePattern,
} from "@/lib/timetable";

const MAX_PERIODS = 10;
const DEFAULT_PERIOD_COUNT = 5;

/** `globals.css` の input 1rem 上書きを避けつつ小型フォントを当てる（Tailwind text-* だけでは効かない） */
const TT_INPUT = "timetable-editor-input";
const TT_INPUT_SM = "timetable-editor-input timetable-editor-input-sm";

/** readOnly 時は input にせずテキスト表示（a11y・見た目） */
const TT_RO_TEXT =
  "text-[calc(0.75rem-2pt)] leading-5 text-zinc-900 dark:text-zinc-100";
const TT_RO_BOX = `rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900/80 ${TT_RO_TEXT}`;
const TT_RO_BOX_DATE = `rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-900/80 ${TT_RO_TEXT}`;
const TT_RO_EMPTY = "text-zinc-400 dark:text-zinc-500";

function formatTimetableDateLabel(iso: string | null | undefined): string {
  const s = iso?.trim() ?? "";
  if (!s) return "―";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(d);
}

/** 年は4桁・最大8桁まで（YYYYMMDD）に制限。ネイティブ type=date の年6桁問題を避ける */
function isValidCalendarYmd(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00`);
  return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
}

function digitsToYmdMasked(raw: string): string {
  const t = raw.trim();
  let digits: string;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) {
    const [y, m, d] = t.split("-");
    digits = `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`.slice(0, 8);
  } else {
    digits = t.replace(/\D/g, "").slice(0, 8);
  }
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function parseCompleteIsoFromMasked(display: string): string | undefined {
  const t = display.trim();
  if (!t) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  const [ys, ms, ds] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!isValidCalendarYmd(y, m, d)) return undefined;
  return t;
}

function TimetableIsoDateField({
  value,
  onCommit,
  className,
}: {
  value: string | undefined;
  /** 確定した YYYY-MM-DD または未入力でクリア（setValidityRange は空文字でクリア） */
  onCommit: (next: string | undefined) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => value?.trim() ?? "");

  useEffect(() => {
    setText(value?.trim() ?? "");
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="YYYY-MM-DD"
      title="数字のみ（最大8桁）。年は4桁で自動で区切ります。"
      value={text}
      onChange={(e) => {
        const masked = digitsToYmdMasked(e.target.value);
        setText(masked);
        if (masked === "") {
          onCommit(undefined);
          return;
        }
        const iso = parseCompleteIsoFromMasked(masked);
        if (iso) onCommit(iso);
      }}
      onBlur={() => {
        if (!text.trim()) {
          onCommit(undefined);
          return;
        }
        const iso = parseCompleteIsoFromMasked(text);
        if (iso) onCommit(iso);
        else setText(value?.trim() ?? "");
      }}
      className={className}
    />
  );
}

function applyBulkPeriodMeta(
  pattern: TimetablePattern,
  rows: { start: string; duration: string }[],
): TimetablePattern {
  const periodMeta = pattern.periodMeta.map((m) => ({ ...m }));
  const durs: (number | null)[] = rows.map((r) => {
    const t = r.duration.trim();
    if (!t) return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  });

  const defined = durs.filter((x): x is number => x != null);
  let defaultDurationMin = pattern.defaultDurationMin;

  if (defined.length === rows.length && defined.length > 0 && defined.every((d) => d === defined[0])) {
    defaultDurationMin = defined[0];
    for (let i = 0; i < periodMeta.length; i++) delete periodMeta[i].durationMin;
  } else {
    for (let i = 0; i < rows.length; i++) {
      if (durs[i] == null) delete periodMeta[i].durationMin;
      else periodMeta[i].durationMin = durs[i]!;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].start.trim()) periodMeta[i].start = rows[i].start.trim();
    else delete periodMeta[i].start;
  }

  return { ...pattern, defaultDurationMin, periodMeta };
}

function buildBulkRows(pattern: TimetablePattern) {
  return Array.from({ length: pattern.periodCount }, (_, i) => ({
    start: pattern.periodMeta[i]?.start ?? "",
    duration: (() => {
      const o = pattern.periodMeta[i]?.durationMin;
      if (o != null) return String(o);
      const d = pattern.defaultDurationMin;
      return d != null ? String(d) : "";
    })(),
  }));
}

function BulkPeriodsModalInner({
  pattern,
  onClose,
  onSave,
}: {
  pattern: TimetablePattern;
  onClose: () => void;
  onSave: (rows: { start: string; duration: string }[]) => void;
}) {
  const [rows, setRows] = useState(() => buildBulkRows(pattern));
  const [fillDur, setFillDur] = useState("");

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[min(85vh,560px)] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-label="全時限の時間をまとめて設定"
      >
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">全時限の時間をまとめて設定</p>
        <p className="mt-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          各行の「分」がすべて同じ数字なら、全体のデフォルトコマ長として保存されます。限ごとに変えたい行だけ別の数字にしてください。
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <label className="min-w-[6rem] flex-1 text-[10px] text-zinc-600 dark:text-zinc-400">
            コマ長を全行にコピー（分）
            <input
              type="number"
              min={1}
              max={180}
              value={fillDur}
              onChange={(e) => setFillDur(e.target.value)}
              placeholder="例: 50"
              className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="button"
            className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            onClick={() => {
              const t = fillDur.trim();
              if (!t) return;
              setRows((prev) => prev.map((r) => ({ ...r, duration: t })));
            }}
          >
            全行に反映
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md bg-zinc-50/80 px-2 py-2 dark:bg-zinc-900/40">
              <span className="w-8 shrink-0 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{i + 1}限</span>
              <label className="min-w-0 flex-1 text-[10px] text-zinc-600 dark:text-zinc-400">
                開始
                <input
                  type="time"
                  value={row.start}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, start: v } : r)));
                  }}
                  className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <label className="w-20 shrink-0 text-[10px] text-zinc-600 dark:text-zinc-400">
                分
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={row.duration}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, duration: v } : r)));
                  }}
                  placeholder="—"
                  className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            onClick={() => onSave(rows)}
          >
            保存して閉じる
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

function AddColumnModalInner({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (label: string) => void;
}) {
  const [name, setName] = useState("");

  const submit = () => {
    const t = name.trim();
    if (!t) return;
    onConfirm(t);
  };

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-label="列を追加"
      >
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">列を追加</p>
        <p className="mt-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          表の右端に新しい列が増えます（例: 土曜・特別授業）。
        </p>
        <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
          列の名前
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            autoFocus
            placeholder="例: 土曜"
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            disabled={!name.trim()}
            onClick={submit}
          >
            追加する
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

function PeriodModalInner({
  periodIndex,
  start,
  durationDisplay,
  defaultIsUnset,
  onClose,
  onSave,
}: {
  periodIndex: number;
  start: string;
  durationDisplay: string;
  defaultIsUnset: boolean;
  onClose: () => void;
  onSave: (start: string, durationRaw: string) => void;
}) {
  const [s, setS] = useState(start);
  const [d, setD] = useState(durationDisplay);

  useEffect(() => {
    setS(start);
    setD(durationDisplay);
  }, [start, durationDisplay, periodIndex]);

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-3"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-label={`${periodIndex + 1}限の時間設定`}
      >
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{periodIndex + 1}限の設定</p>
        <p className="mt-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          {defaultIsUnset
            ? "コマの長さを初めて入れると、すべての時限のデフォルトになります。あとから別の限だけ変えられます。"
            : "この限だけ長さを変えられます。空にすると全体のデフォルトに戻します。"}
        </p>
        <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
          開始時刻（任意）
          <input
            type="time"
            value={s}
            onChange={(e) => setS(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="mt-2 block text-xs text-zinc-600 dark:text-zinc-400">
          1コマの長さ（分・任意）
          <input
            type="number"
            min={1}
            max={180}
            value={d}
            onChange={(e) => setD(e.target.value)}
            placeholder="例: 50"
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="button"
          className="mt-4 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          onClick={() => onSave(s, d)}
        >
          保存して閉じる
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  stLevel: string;
  compact?: boolean;
  /** 閲覧のみ（プレビュー）。編集系 UI を出さず、パターン切替のみ可能 */
  readOnly?: boolean;
};

function updateActivePattern(
  bundle: TimetableBundle,
  fn: (p: TimetablePattern) => TimetablePattern,
): TimetableBundle {
  const i = bundle.activePatternIndex;
  const patterns = bundle.patterns.map((p, j) => (j === i ? fn(p) : p));
  return { ...bundle, patterns };
}

export function TimetableEditor({
  value,
  onChange,
  stLevel,
  compact = false,
  readOnly = false,
}: Props) {
  const hsPalette = useHighSchoolSubjectPalette(stLevel);

  const [bundle, setBundle] = useState<TimetableBundle>(() => {
    const p = parseTimetableStored(value);
    return p ?? emptyTimetable();
  });

  /** readOnly 時はパターン切替だけローカル（保存文字列は変えない） */
  const [browsePatternIdx, setBrowsePatternIdx] = useState(0);

  const [periodModal, setPeriodModal] = useState<number | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkModalKey, setBulkModalKey] = useState(0);
  const [addColumnModalOpen, setAddColumnModalOpen] = useState(false);
  const [addColumnModalKey, setAddColumnModalKey] = useState(0);
  const [lastCell, setLastCell] = useState<{ colId: string; period: number } | null>(null);
  const [newPatternName, setNewPatternName] = useState("");

  useEffect(() => {
    const p = parseTimetableStored(value);
    setBundle(p ?? emptyTimetable());
    if (readOnly && p) {
      setBrowsePatternIdx(
        Math.min(p.activePatternIndex, Math.max(0, p.patterns.length - 1)),
      );
    }
  }, [value, readOnly]);

  const patternIndexForView = readOnly ? browsePatternIdx : bundle.activePatternIndex;
  const data = bundle.patterns[patternIndexForView] ?? bundle.patterns[0];

  const commit = useCallback(
    (next: TimetableBundle) => {
      if (readOnly) return;
      setBundle(next);
      onChange(serializeTimetable(next));
    },
    [onChange, readOnly],
  );

  const setValidityRange = useCallback(
    (patch: { validFrom?: string; validTo?: string }) => {
      let from = patch.validFrom !== undefined ? patch.validFrom || undefined : bundle.validFrom;
      let to = patch.validTo !== undefined ? patch.validTo || undefined : bundle.validTo;
      if (from && to && from > to) {
        const t = from;
        from = to;
        to = t;
      }
      commit({ ...bundle, validFrom: from, validTo: to });
    },
    [bundle, commit],
  );

  const cellKey = (colId: string, period: number) => `${colId}-${period}`;

  const setCell = (colId: string, period: number, text: string) => {
    const k = cellKey(colId, period);
    commit(
      updateActivePattern(bundle, (pat) => ({
        ...pat,
        cells: { ...pat.cells, [k]: text },
      })),
    );
  };

  const addStdWeekdays = () => {
    commit(
      updateActivePattern(bundle, (pat) => ({
        ...pat,
        columns: appendMissingStdWeekdays(pat.columns),
      })),
    );
  };

  const addWeekendOrExtra = () => {
    commit(
      updateActivePattern(bundle, (pat) => {
        const next = appendNextWeekendColumn(pat.columns);
        return next ? { ...pat, columns: next } : pat;
      }),
    );
  };

  const confirmAddColumn = (label: string) => {
    const t = label.trim();
    if (!t) return;
    commit(
      updateActivePattern(bundle, (pat) => ({
        ...pat,
        columns: addCustomColumn(pat.columns, t),
      })),
    );
    setAddColumnModalOpen(false);
  };

  const addPattern = () => {
    const name = newPatternName.trim();
    if (!name) return;
    const template = data;
    const nextPat = duplicatePatternStructure(name, template);
    commit({
      ...bundle,
      patterns: [...bundle.patterns, nextPat],
      activePatternIndex: bundle.patterns.length,
    });
    setNewPatternName("");
  };

  const removePattern = () => {
    if (bundle.patterns.length <= 1) return;
    const idx = bundle.activePatternIndex;
    const patterns = bundle.patterns.filter((_, j) => j !== idx);
    const activePatternIndex = Math.min(idx, patterns.length - 1);
    commit({ ...bundle, patterns, activePatternIndex });
  };

  const removeColumn = (colId: string) => {
    commit(
      updateActivePattern(bundle, (pat) => {
        if (pat.columns.length <= 1) return pat;
        const columns = pat.columns.filter((c) => c.id !== colId);
        const cells = { ...pat.cells };
        for (let p = 1; p <= pat.periodCount; p++) {
          delete cells[cellKey(colId, p)];
        }
        return { ...pat, columns, cells };
      }),
    );
  };

  const addPeriod = () => {
    commit(
      updateActivePattern(bundle, (pat) => {
        if (pat.periodCount >= MAX_PERIODS) return pat;
        return {
          ...pat,
          periodCount: pat.periodCount + 1,
          periodMeta: [...pat.periodMeta, {}],
        };
      }),
    );
  };

  const removePeriod = () => {
    commit(
      updateActivePattern(bundle, (pat) => {
        if (pat.periodCount <= 1) return pat;
        const newCount = pat.periodCount - 1;
        const cells = { ...pat.cells };
        for (const col of pat.columns) {
          delete cells[cellKey(col.id, pat.periodCount)];
        }
        return {
          ...pat,
          periodCount: newCount,
          periodMeta: pat.periodMeta.slice(0, newCount),
        };
      }),
    );
  };

  const savePeriodRow = (idx: number, start: string, durationRaw: string) => {
    commit(
      updateActivePattern(bundle, (pat) => {
        const periodMeta = pat.periodMeta.map((m) => ({ ...m }));
        const d = durationRaw.trim();
        const n = d ? Number.parseInt(d, 10) : NaN;
        const hasDur = Number.isFinite(n) && n > 0;

        let defaultDurationMin = pat.defaultDurationMin;

        if (!d) {
          delete periodMeta[idx].durationMin;
        } else if (hasDur) {
          if (defaultDurationMin == null) {
            defaultDurationMin = n;
            for (let i = 0; i < periodMeta.length; i++) {
              delete periodMeta[i].durationMin;
            }
          } else {
            periodMeta[idx].durationMin = n;
          }
        }

        if (start.trim()) periodMeta[idx].start = start.trim();
        else delete periodMeta[idx].start;

        return { ...pat, defaultDurationMin, periodMeta };
      }),
    );
  };

  const saveBulkPeriods = (rows: { start: string; duration: string }[]) => {
    commit(
      updateActivePattern(bundle, (pat) => {
        const aligned = rows.slice(0, pat.periodCount);
        while (aligned.length < pat.periodCount) {
          aligned.push({ start: "", duration: "" });
        }
        return applyBulkPeriodMeta(pat, aligned);
      }),
    );
    setBulkModalOpen(false);
  };

  const btnSm =
    "rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

  const missingStd = STD_WEEK_LABELS.some((lb) => !data.columns.some((c) => c.label === lb));

  const modalDurationDisplay = useMemo(() => {
    if (periodModal === null) return "";
    const eff = effectiveDurationMin(data, periodModal);
    return eff != null ? String(eff) : "";
  }, [periodModal, data]);

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <div
          className="flex min-w-0 flex-1 basis-0 items-center gap-2 text-[10px] text-zinc-600 dark:text-zinc-400"
          title="パターンの科目マスは消えません"
        >
          <span className="shrink-0 whitespace-nowrap">学期・年度（任意）</span>
          {readOnly ? (
            <div className={`min-w-0 flex-1 ${TT_RO_BOX}`}>
              {bundle.scenarioLabel?.trim() ? (
                bundle.scenarioLabel
              ) : (
                <span className={TT_RO_EMPTY}>―</span>
              )}
            </div>
          ) : (
            <input
              type="text"
              value={bundle.scenarioLabel ?? ""}
              onChange={(e) => commit({ ...bundle, scenarioLabel: e.target.value })}
              placeholder="2025年度 前期"
              className={`${TT_INPUT} min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950`}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 basis-0 items-center gap-2 text-[10px] text-zinc-600 dark:text-zinc-400">
          <span className="shrink-0 whitespace-nowrap">パターン名</span>
          {readOnly ? (
            <div className={`min-w-0 flex-1 ${TT_RO_BOX}`}>
              {data.label.trim() ? data.label : <span className={TT_RO_EMPTY}>―</span>}
            </div>
          ) : (
            <input
              type="text"
              value={data.label}
              onChange={(e) =>
                commit(updateActivePattern(bundle, (pat) => ({ ...pat, label: e.target.value })))
              }
              placeholder="A週・メイン"
              className={`${TT_INPUT} min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950`}
            />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-nowrap items-center gap-x-2 overflow-x-auto overscroll-x-contain">
        <span className="shrink-0 whitespace-nowrap text-[10px] text-zinc-500 dark:text-zinc-400">
          有効期間
        </span>
        <div className="flex min-w-[9rem] shrink-0 items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-400">
          <span className="shrink-0 whitespace-nowrap">開始</span>
          {readOnly ? (
            <div className={`min-w-[7.75rem] flex-1 tabular-nums ${TT_RO_BOX_DATE}`}>
              {formatTimetableDateLabel(bundle.validFrom)}
            </div>
          ) : (
            <TimetableIsoDateField
              value={bundle.validFrom}
              onCommit={(next) => setValidityRange({ validFrom: next ?? "" })}
              className={`${TT_INPUT} min-w-[9rem] max-w-[10.5rem] flex-1 rounded-md border border-zinc-200 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-950`}
            />
          )}
        </div>
        <span className="shrink-0 text-[10px] text-zinc-400">〜</span>
        <div className="flex min-w-[9rem] shrink-0 items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-400">
          <span className="shrink-0 whitespace-nowrap">終了</span>
          {readOnly ? (
            <div className={`min-w-[7.75rem] flex-1 tabular-nums ${TT_RO_BOX_DATE}`}>
              {formatTimetableDateLabel(bundle.validTo)}
            </div>
          ) : (
            <TimetableIsoDateField
              value={bundle.validTo}
              onCommit={(next) => setValidityRange({ validTo: next ?? "" })}
              className={`${TT_INPUT} min-w-[9rem] max-w-[10.5rem] flex-1 rounded-md border border-zinc-200 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-950`}
            />
          )}
        </div>
      </div>

      {bundle.patterns.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">別パターンに切り替え</span>
          <select
            value={patternIndexForView}
            onChange={(e) => {
              const i = Number.parseInt(e.target.value, 10) || 0;
              if (readOnly) setBrowsePatternIdx(i);
              else commit({ ...bundle, activePatternIndex: i });
            }}
            className="max-w-[12rem] rounded-md border border-zinc-200 bg-white px-2 py-1 text-[calc(11px-2pt)] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {bundle.patterns.map((p, i) => (
              <option key={p.id} value={i}>
                {p.label.trim() || `パターン${i + 1}`}
              </option>
            ))}
          </select>
          {!readOnly ? (
            <button type="button" className={btnSm} onClick={removePattern}>
              このパターンを削除
            </button>
          ) : null}
        </div>
      ) : null}

      {!readOnly ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {missingStd ? (
              <button type="button" className={btnSm} onClick={addStdWeekdays}>
                月〜金を足す
              </button>
            ) : null}
            <button type="button" className={btnSm} onClick={addWeekendOrExtra}>
              ＋曜日（土・日）
            </button>
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-1 [flex-basis:14rem]">
              <input
                type="text"
                value={newPatternName}
                onChange={(e) => setNewPatternName(e.target.value)}
                placeholder="新パターン名（例: B週・後期）"
                className={`${TT_INPUT_SM} min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950`}
              />
              <button type="button" className={btnSm} onClick={addPattern}>
                パターンを追加
              </button>
            </div>
          </div>

          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            A週/B週など別の表は「パターンを追加」で増やせます（枠だけ引き継ぎ、科目マスは空です）。列だけ増やすときは下の「全時限の時間をまとめて設定」の右の「列を追加」から入力してください。
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnSm} onClick={addPeriod} disabled={data.periodCount >= MAX_PERIODS}>
              ＋時限を追加
            </button>
            <button type="button" className={btnSm} onClick={removePeriod} disabled={data.periodCount <= 1}>
              最後の時限を削除
            </button>
            <button
              type="button"
              className={btnSm}
              onClick={() => {
                setBulkModalKey((k) => k + 1);
                setBulkModalOpen(true);
              }}
            >
              全時限の時間をまとめて設定
            </button>
            <button
              type="button"
              className={btnSm}
              onClick={() => {
                setAddColumnModalKey((k) => k + 1);
                setAddColumnModalOpen(true);
              }}
            >
              列を追加
            </button>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              標準は{DEFAULT_PERIOD_COUNT}限（最大{MAX_PERIODS}限）
            </span>
          </div>
        </>
      ) : null}

      <div className={compact ? "overflow-x-auto" : ""}>
        <table className="w-full min-w-[280px] table-fixed border-collapse text-[calc(0.75rem-2pt)]">
          <colgroup>
            <col className="w-[3.7rem] min-w-[3.7rem]" />
            {data.columns.map((col) => (
              <col key={col.id} className="min-w-[4.5rem]" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="border border-zinc-200 bg-zinc-100 p-1 text-left dark:border-zinc-700 dark:bg-zinc-800">
                {" "}
              </th>
              {data.columns.map((col) => (
                <th
                  key={col.id}
                  className="border border-zinc-200 bg-zinc-100 p-1 text-center font-medium dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{col.label}</span>
                    {data.columns.length > 1 && !readOnly ? (
                      <button
                        type="button"
                        className="text-[10px] text-zinc-500 underline dark:text-zinc-400"
                        onClick={() => removeColumn(col.id)}
                      >
                        削除
                      </button>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: data.periodCount }, (_, i) => i + 1).map((period) => (
              <tr key={period}>
                <td className="border border-zinc-200 bg-zinc-50 p-1 align-top dark:border-zinc-700 dark:bg-zinc-900/50">
                  {readOnly ? (
                    <div className="w-full min-w-0 text-left text-[calc(11px-2pt)] font-medium leading-snug text-zinc-700 dark:text-zinc-200">
                      {period}限
                      <span className="mt-0.5 block break-words text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
                        {(() => {
                          const meta = data.periodMeta[period - 1];
                          const st = meta?.start;
                          const dur = effectiveDurationMin(data, period - 1);
                          if (st && dur != null) return `${st} / ${dur}分`;
                          if (st) return `開始 ${st}`;
                          if (dur != null) return `${dur}分`;
                          return "時間を設定";
                        })()}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full min-w-0 text-left text-[calc(11px-2pt)] font-medium leading-snug text-zinc-700 dark:text-zinc-200"
                      onClick={() => setPeriodModal(period - 1)}
                    >
                      {period}限
                      <span className="mt-0.5 block break-words text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
                        {(() => {
                          const meta = data.periodMeta[period - 1];
                          const st = meta?.start;
                          const dur = effectiveDurationMin(data, period - 1);
                          if (st && dur != null) return `${st} / ${dur}分`;
                          if (st) return `開始 ${st}`;
                          if (dur != null) return `${dur}分`;
                          return "時間を設定";
                        })()}
                      </span>
                    </button>
                  )}
                </td>
                {data.columns.map((col) => {
                  const k = cellKey(col.id, period);
                  const v = data.cells[k] ?? "";
                  return (
                    <td key={k} className="border border-zinc-200 p-0 dark:border-zinc-700">
                      {readOnly ? (
                        <div
                          className={`flex min-h-10 min-w-[4.5rem] items-center px-1.5 py-1 ${TT_RO_TEXT} ${
                            v.trim() ? "" : TT_RO_EMPTY
                          }`}
                        >
                          {v.trim() ? v : "―"}
                        </div>
                      ) : (
                        <input
                          value={v}
                          onChange={(e) => setCell(col.id, period, e.target.value)}
                          onFocus={() => setLastCell({ colId: col.id, period })}
                          className={`${TT_INPUT} h-10 w-full min-w-[4.5rem] border-0 bg-transparent px-1.5 py-1 outline-none focus:ring-1 focus:ring-emerald-500/40 dark:text-zinc-100`}
                          placeholder="科目"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && hsPalette ? (
        <div className="flex flex-wrap gap-1.5">
          <span className="w-full text-[10px] text-zinc-500 dark:text-zinc-400">
            よく使う科目（表のマスを一度タップしてから押すとそのコマに入ります）
          </span>
          {HS_SUBJECT_CHIPS.map((sub) => (
            <button
              key={sub}
              type="button"
              className={btnSm}
              onClick={() => {
                if (!lastCell) return;
                setCell(lastCell.colId, lastCell.period, sub);
              }}
            >
              {sub}
            </button>
          ))}
          <button
            type="button"
            className={btnSm}
            onClick={() => {
              if (!lastCell) return;
              setCell(lastCell.colId, lastCell.period, "");
            }}
          >
            クリア
          </button>
        </div>
      ) : !readOnly ? (
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">大学生・高専・短大などは各マスに自由入力できます。</p>
      ) : null}

      {periodModal !== null && !readOnly && (
        <PeriodModalInner
          periodIndex={periodModal}
          start={data.periodMeta[periodModal]?.start ?? ""}
          durationDisplay={modalDurationDisplay}
          defaultIsUnset={data.defaultDurationMin == null}
          onClose={() => setPeriodModal(null)}
          onSave={(start, dur) => {
            savePeriodRow(periodModal, start, dur);
            setPeriodModal(null);
          }}
        />
      )}

      {bulkModalOpen && !readOnly ? (
        <BulkPeriodsModalInner
          key={bulkModalKey}
          pattern={data}
          onClose={() => setBulkModalOpen(false)}
          onSave={saveBulkPeriods}
        />
      ) : null}

      {addColumnModalOpen && !readOnly ? (
        <AddColumnModalInner
          key={addColumnModalKey}
          onClose={() => setAddColumnModalOpen(false)}
          onConfirm={confirmAddColumn}
        />
      ) : null}
    </div>
  );
}
