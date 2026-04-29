"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InterestFine, InterestSub } from "@/lib/interest-taxonomy";
import {
  INTEREST_CATEGORIES,
  INTEREST_USER_FINE_INFIX,
  defaultFinesForSub,
  findInterestFineInSub,
  interestFineHasNestedExtras,
  isFineBranchSelected,
  isInterestFreePick,
  labelForInterestFreePick,
  labelForUserFinePick,
  makeInterestFreePick,
  makeUserFinePick,
  stripFineBranchFromPicks,
} from "@/lib/interest-taxonomy";

/** 大分類内に少なくとも1件の選択（小分類IDまたはその配下）があるか */
function categoryHasAnyPick(value: string[], c: (typeof INTEREST_CATEGORIES)[number]): boolean {
  return c.subs.some(
    (s) => value.includes(s.id) || value.some((v) => v.startsWith(`${s.id}:`)),
  );
}

/** 大分類に属する選択エントリの件数（value の要素ごとに1） */
function countPicksInCategory(value: string[], c: (typeof INTEREST_CATEGORIES)[number]): number {
  return value.filter((v) =>
    c.subs.some((s) => v === s.id || v.startsWith(`${s.id}:`)),
  ).length;
}

function HorizontalChipScroller({
  children,
  chipStripScroll,
  btnCls,
  stepPx = 220,
}: {
  children: React.ReactNode;
  chipStripScroll: string;
  btnCls: string;
  stepPx?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const left = el.scrollLeft;
      setAtStart(left <= 1);
      setAtEnd(left >= max - 1);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const scrollBy = (dx: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dx, behavior: "smooth" });
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        aria-label="左へ"
        onClick={() => scrollBy(-stepPx)}
        disabled={atStart}
        className={`${btnCls} disabled:opacity-40`}
      >
        ←
      </button>
      <div ref={ref} className={`${chipStripScroll} min-w-0 flex-1`}>
        {children}
      </div>
      <button
        type="button"
        aria-label="右へ"
        onClick={() => scrollBy(stepPx)}
        disabled={atEnd}
        className={`${btnCls} disabled:opacity-40`}
      >
        →
      </button>
    </div>
  );
}

export function InterestPicksControl({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [catId, setCatId] = useState(INTEREST_CATEGORIES[0]?.id ?? "music");
  const [customLine, setCustomLine] = useState("");
  const [detailCustomLine, setDetailCustomLine] = useState("");
  const [activeSubId, setActiveSubId] = useState<string>("");
  const [detailFreePanelOpen, setDetailFreePanelOpen] = useState(false);
  const [globalFreePanelOpen, setGlobalFreePanelOpen] = useState(false);
  /** micro / works 行を表示する親詳細タグ */
  const [activeFineId, setActiveFineId] = useState("");
  const customRef = useRef<HTMLInputElement>(null);
  const freeInputAnchorRef = useRef<HTMLDivElement>(null);
  const detailCustomRef = useRef<HTMLInputElement>(null);

  const category = INTEREST_CATEGORIES.find((c) => c.id === catId) ?? INTEREST_CATEGORIES[0];

  const resetDetailPanels = () => {
    setDetailCustomLine("");
    setDetailFreePanelOpen(false);
    setActiveFineId("");
  };

  const setActiveSubIdAndReset = (next: string) => {
    setActiveSubId(next);
    resetDetailPanels();
  };

  const selectedSubsInCategory = useMemo(
    () =>
      category.subs.filter(
        (s) => value.includes(s.id) || value.some((v) => v.startsWith(`${s.id}:`)),
      ),
    [category, value],
  );

  const activeSub = useMemo(() => {
    if (activeSubId) return category.subs.find((s) => s.id === activeSubId) ?? null;
    return selectedSubsInCategory[0] ?? null;
  }, [activeSubId, category.subs, selectedSubsInCategory]);

  const userFineIdsForActiveSub = useMemo(() => {
    if (!activeSub) return [];
    const prefix = `${activeSub.id}${INTEREST_USER_FINE_INFIX}`;
    return value.filter((v) => v.startsWith(prefix));
  }, [activeSub, value]);

  const detailSubFocused =
    !!activeSub &&
    activeSubId === activeSub.id &&
    (value.includes(activeSub.id) || value.some((v) => v.startsWith(`${activeSub.id}:`)));

  const nestedPanelFine = useMemo(() => {
    if (!detailSubFocused || !activeSub || !activeFineId) return null;
    const f = findInterestFineInSub(activeSub, activeFineId);
    if (!f || !interestFineHasNestedExtras(f) || !isFineBranchSelected(value, f)) return null;
    return f;
  }, [detailSubFocused, activeSub, activeFineId, value]);

  const showNestedFineHowto = useMemo(() => {
    if (!activeSub) return false;
    return defaultFinesForSub(activeSub).some(interestFineHasNestedExtras);
  }, [activeSub]);

  const detailFreePanelEffectiveOpen = detailSubFocused ? detailFreePanelOpen : false;

  useEffect(() => {
    if (!globalFreePanelOpen) return;
    const id = window.setTimeout(() => {
      freeInputAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      customRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [globalFreePanelOpen]);

  useEffect(() => {
    if (!detailFreePanelEffectiveOpen || !detailSubFocused) return;
    const id = window.setTimeout(() => detailCustomRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [detailFreePanelEffectiveOpen, detailSubFocused]);

  function removeSubAndDescendants(subId: string) {
    onChange(value.filter((x) => x !== subId && !x.startsWith(`${subId}:`)));
  }

  function toggleSub(sub: InterestSub) {
    const selected = value.includes(sub.id) || value.some((v) => v.startsWith(`${sub.id}:`));
    // 選択済みをタップ → まずはアクティブ化（詳細表示の対象を切り替える）
    if (selected && activeSubId !== sub.id) {
      setActiveSubIdAndReset(sub.id);
      return;
    }
    // 選択済みかつアクティブを再タップ → 解除
    if (selected) {
      removeSubAndDescendants(sub.id);
      if (activeSubId === sub.id) setActiveSubIdAndReset("");
      return;
    }
    // 未選択 → 選択
    onChange([...value, sub.id]);
    setActiveSubIdAndReset(sub.id);
  }

  function toggleFine(sub: InterestSub, fineId: string) {
    if (value.includes(fineId)) {
      onChange(value.filter((x) => x !== fineId));
      return;
    }
    const next = [...value];
    if (!next.includes(sub.id)) next.push(sub.id);
    next.push(fineId);
    onChange(next);
  }

  function toggleFineBranch(sub: InterestSub, fine: InterestFine) {
    if (!interestFineHasNestedExtras(fine)) {
      toggleFine(sub, fine.id);
      return;
    }
    const sel = isFineBranchSelected(value, fine);
    if (sel && activeFineId !== fine.id) {
      setActiveFineId(fine.id);
      return;
    }
    if (sel) {
      onChange(stripFineBranchFromPicks(value, fine));
      if (activeFineId === fine.id) setActiveFineId("");
      return;
    }
    const next = [...value];
    if (!next.includes(sub.id)) next.push(sub.id);
    next.push(fine.id);
    onChange(next);
    setActiveFineId(fine.id);
  }

  function toggleNestedUnderFine(sub: InterestSub, parentFine: InterestFine, childId: string) {
    if (value.includes(childId)) {
      onChange(value.filter((x) => x !== childId));
      return;
    }
    const next = [...value];
    if (!next.includes(sub.id)) next.push(sub.id);
    if (!next.includes(parentFine.id)) next.push(parentFine.id);
    next.push(childId);
    onChange(next);
  }

  function removeFreePick(id: string) {
    onChange(value.filter((x) => x !== id));
  }

  function addCustomLine() {
    const raw = customLine;
    setCustomLine("");
    const id = makeInterestFreePick(raw);
    if (!id || value.includes(id)) return;
    onChange([...value, id]);
  }

  function addUserFineLine(sub: InterestSub) {
    const raw = detailCustomLine;
    setDetailCustomLine("");
    const id = makeUserFinePick(sub.id, raw);
    if (!id || value.includes(id)) return;
    const next = [...value];
    if (!next.includes(sub.id)) next.push(sub.id);
    next.push(id);
    onChange(next);
  }

  function removeUserFinePick(id: string) {
    onChange(value.filter((x) => x !== id));
  }

  const freePicks = value.filter(isInterestFreePick);

  const chipStripScroll =
    "min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  /** 横スクロールチップ共通（高さを抑える） */
  const chipSm = "px-2 py-0.5 text-[11px] leading-tight";
  const chipSmRound = "rounded-lg border";
  const scrollBtnCls = `${chipSmRound} ${chipSm} bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900`;
  const addBtnClass =
    "shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-medium leading-tight text-white dark:bg-zinc-200 dark:text-zinc-900";

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden">
      <div className="space-y-1">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">大分類</p>
        <HorizontalChipScroller
          chipStripScroll={chipStripScroll}
          btnCls={scrollBtnCls}
          stepPx={260}
        >
          <div className="flex w-max items-center gap-1.5">
            {INTEREST_CATEGORIES.map((c) => {
              const active = c.id === catId;
              const hasPickInCategory = categoryHasAnyPick(value, c);
              const pickCountInCategory = countPicksInCategory(value, c);
              const chipClass =
                active && hasPickInCategory
                  ? "bg-emerald-600 text-white shadow-sm ring-2 ring-white/40 dark:bg-emerald-500 dark:ring-white/25"
                  : active
                    ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                    : hasPickInCategory
                      ? "bg-emerald-50 text-emerald-900 ring-2 ring-emerald-400/70 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-500/50 dark:hover:bg-emerald-950/70"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200";
              return (
                <button
                  key={c.id}
                  type="button"
                  title={
                    hasPickInCategory
                      ? active
                        ? `この大分類を表示中（${pickCountInCategory}件）`
                        : `この大分類で${pickCountInCategory}件選択済み（タップで表示）`
                      : undefined
                  }
                  onClick={() => {
                    setCatId(c.id);
                    const nextCat = INTEREST_CATEGORIES.find((x) => x.id === c.id) ?? INTEREST_CATEGORIES[0];
                    const exists = nextCat?.subs?.some((s) => s.id === activeSubId) ?? false;
                    if (!exists) setActiveSubIdAndReset("");
                  }}
                  className={`rounded-full font-medium transition ${chipSm} ${chipClass}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {hasPickInCategory && !active ? (
                      <span
                        className="min-w-[1ch] shrink-0 tabular-nums font-semibold text-emerald-700 dark:text-emerald-300"
                        aria-label={`${pickCountInCategory}件`}
                      >
                        {pickCountInCategory}
                      </span>
                    ) : null}
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </HorizontalChipScroller>
      </div>

      <div>
        <p className="mb-1 text-xs text-zinc-600 dark:text-zinc-400">小分類</p>
        <HorizontalChipScroller chipStripScroll={chipStripScroll} btnCls={scrollBtnCls} stepPx={260}>
          <div className="flex w-max items-center gap-1.5">
            {category.subs.map((s) => {
              const on =
                value.includes(s.id) || value.some((v) => v.startsWith(`${s.id}:`) && v !== s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSub(s)}
                  className={`${chipSmRound} transition ${chipSm} ${
                    on
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setGlobalFreePanelOpen((o) => !o)}
              className={`${chipSmRound} transition ${chipSm} ${
                globalFreePanelOpen
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              }`}
            >
              ＋自由入力
            </button>
          </div>
        </HorizontalChipScroller>
      </div>

      {detailSubFocused && activeSub && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            詳細タグ（任意）{" "}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">「{activeSub.label}」</span>
          </p>
          {showNestedFineHowto ? (
            <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
              詳細タグに下の段がある場合：選んだあと、もう一度同じタップで「テーマ・見方」と「作品例」などが開きます。もう一度タップでまとめて外せます。
            </p>
          ) : null}
          <HorizontalChipScroller chipStripScroll={chipStripScroll} btnCls={scrollBtnCls} stepPx={260}>
            <div className="flex w-max items-center gap-1.5">
              {defaultFinesForSub(activeSub).map((f) => {
                const fon = isFineBranchSelected(value, f);
                const focusedFine =
                  interestFineHasNestedExtras(f) &&
                  activeFineId === f.id &&
                  isFineBranchSelected(value, f);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFineBranch(activeSub, f)}
                    className={`${chipSmRound} transition ${chipSm} ${
                      fon
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                    } ${focusedFine ? "ring-2 ring-emerald-400 ring-offset-1 dark:ring-offset-zinc-900" : ""}`}
                  >
                    {f.label}
                  </button>
                );
              })}
              {userFineIdsForActiveSub.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => removeUserFinePick(id)}
                  className={`${chipSmRound} border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100 ${chipSm}`}
                >
                  {labelForUserFinePick(activeSub.id, id) ?? id} ×
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDetailFreePanelOpen((o) => !o)}
                className={`${chipSmRound} transition ${chipSm} ${
                  detailFreePanelOpen
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
                    : "border-dashed border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300"
                }`}
              >
                ＋自由入力
              </button>
            </div>
          </HorizontalChipScroller>
          {nestedPanelFine ? (
            <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-900/50">
              <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                「{nestedPanelFine.label}」のさらに詳細{" "}
                <span className="font-normal text-zinc-500 dark:text-zinc-400">
                  （テーマ別・作品例）
                </span>
              </p>
              {(nestedPanelFine.micro ?? []).length > 0 ? (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">テーマ・見方</p>
                  <HorizontalChipScroller chipStripScroll={chipStripScroll} btnCls={scrollBtnCls} stepPx={240}>
                    <div className="flex w-max items-center gap-1.5">
                      {(nestedPanelFine.micro ?? []).map((ch) => {
                        const on = value.includes(ch.id);
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => toggleNestedUnderFine(activeSub, nestedPanelFine, ch.id)}
                            className={`${chipSmRound} transition ${chipSm} ${
                              on
                                ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                            }`}
                          >
                            {ch.label}
                          </button>
                        );
                      })}
                    </div>
                  </HorizontalChipScroller>
                </div>
              ) : null}
              {(nestedPanelFine.works ?? []).length > 0 ? (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    作品例（代表的なタイトル）
                  </p>
                  <HorizontalChipScroller chipStripScroll={chipStripScroll} btnCls={scrollBtnCls} stepPx={240}>
                    <div className="flex w-max items-center gap-1.5">
                      {(nestedPanelFine.works ?? []).map((ch) => {
                        const on = value.includes(ch.id);
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => toggleNestedUnderFine(activeSub, nestedPanelFine, ch.id)}
                            className={`${chipSmRound} transition ${chipSm} ${
                              on
                                ? "border-sky-500 bg-sky-50 text-sky-950 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                            }`}
                          >
                            {ch.label}
                          </button>
                        );
                      })}
                    </div>
                  </HorizontalChipScroller>
                </div>
              ) : null}
            </div>
          ) : null}
          {detailFreePanelEffectiveOpen && (
            <div className="space-y-0.5">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">自由入力</p>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900/40">
                <input
                  ref={detailCustomRef}
                  value={detailCustomLine}
                  onChange={(e) => setDetailCustomLine(e.target.value)}
                  placeholder={`「${activeSub.label}」用（80文字まで）`}
                  maxLength={80}
                  className="min-w-0 flex-1 basis-[10rem] bg-transparent text-[11px] leading-tight outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addUserFineLine(activeSub);
                    }
                  }}
                />
                <button type="button" onClick={() => addUserFineLine(activeSub)} className={addBtnClass}>
                  追加
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={freeInputAnchorRef}>
        {globalFreePanelOpen && (
          <div className="space-y-0.5">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">自由入力</p>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950">
              <input
                ref={customRef}
                value={customLine}
                onChange={(e) => setCustomLine(e.target.value)}
                placeholder="チーム名・選手・作品名など（80文字まで）"
                maxLength={80}
                className="min-w-0 flex-1 basis-[12rem] bg-transparent text-[11px] leading-tight outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomLine();
                  }
                }}
              />
              <button type="button" onClick={() => addCustomLine()} className={addBtnClass}>
                追加
              </button>
            </div>
          </div>
        )}
      </div>

      {freePicks.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[11px] text-zinc-500">自由入力</p>
          <HorizontalChipScroller chipStripScroll={chipStripScroll} btnCls={scrollBtnCls} stepPx={260}>
            <div className="flex w-max items-center gap-1.5">
              {freePicks.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => removeFreePick(id)}
                  className={`${chipSmRound} border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100 ${chipSm}`}
                >
                  {labelForInterestFreePick(id) ?? id} ×
                </button>
              ))}
            </div>
          </HorizontalChipScroller>
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-500">
            選択中: {value.length} 件（保存時にプロフィールへ反映）
          </p>
          <button
            type="button"
            onClick={() => {
              onChange([]);
              setActiveSubId("");
              setActiveFineId("");
              setCustomLine("");
              setDetailCustomLine("");
              setDetailFreePanelOpen(false);
              setGlobalFreePanelOpen(false);
              setCatId(INTEREST_CATEGORIES[0]?.id ?? "music");
            }}
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            すべて解除
          </button>
        </div>
      )}
    </div>
  );
}
