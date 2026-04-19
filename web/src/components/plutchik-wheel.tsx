"use client";

import { useMemo } from "react";
import {
  PLUTCHIK_COLOR,
  PLUTCHIK_LABEL_JA,
  PLUTCHIK_PRIMARY_ORDER,
  type PlutchikPrimaryKey,
  type PlutchikStoredAnalysis,
} from "@/lib/emotion/plutchik";

const RAD = Math.PI / 180;

function wedgePath(cx: number, cy: number, rInner: number, rOuter: number, startDeg: number, endDeg: number): string {
  const a0 = startDeg * RAD;
  const a1 = endDeg * RAD;
  const x0o = cx + rOuter * Math.cos(a0);
  const y0o = cy + rOuter * Math.sin(a0);
  const x1o = cx + rOuter * Math.cos(a1);
  const y1o = cy + rOuter * Math.sin(a1);
  const x0i = cx + rInner * Math.cos(a0);
  const y0i = cy + rInner * Math.sin(a0);
  const x1i = cx + rInner * Math.cos(a1);
  const y1i = cy + rInner * Math.sin(a1);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${x0i} ${y0i}`,
    `L ${x0o} ${y0o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i}`,
    "Z",
  ].join(" ");
}

export function PlutchikWheel({
  analysis,
  phase,
  compact = false,
}: {
  analysis: PlutchikStoredAnalysis | null;
  phase: "idle" | "loading" | "ready";
  compact?: boolean;
}) {
  const size = compact ? 112 : 200;
  const pad = 8;
  const cx = size / 2;
  const cy = size / 2;
  const rMax = size / 2 - pad;

  const wedges = useMemo(() => {
    const list: {
      key: PlutchikPrimaryKey;
      path: string;
      fill: string;
      opacity: number;
      labelJa: string;
      labelX: number;
      labelY: number;
      score: number;
    }[] = [];
    const emptySkeleton = !analysis && phase !== "loading";
    for (let i = 0; i < PLUTCHIK_PRIMARY_ORDER.length; i++) {
      const key = PLUTCHIK_PRIMARY_ORDER[i]!;
      const startDeg = -90 + i * 45;
      const endDeg = -90 + (i + 1) * 45;
      const score = analysis?.primary[key]?.score ?? 0;
      const rInner = compact ? 14 : 22;
      const t = phase === "loading" ? 0 : emptySkeleton ? 0.4 : score / 100;
      const rOuter = emptySkeleton
        ? rInner + (rMax - rInner) * 0.58
        : rInner + (rMax - rInner) * (0.08 + 0.92 * t);
      const base = PLUTCHIK_COLOR[key];
      const opacity = phase === "loading" ? 0.12 : emptySkeleton ? 0.52 : 0.2 + 0.75 * (score / 100);
      const midDeg = (-90 + i * 45 + 22.5) * RAD;
      const rLabel = (rInner + rOuter) * 0.5;
      list.push({
        key,
        path: wedgePath(cx, cy, rInner, rOuter, startDeg, endDeg),
        fill: phase === "loading" ? "#a1a1aa" : base,
        opacity,
        labelJa: PLUTCHIK_LABEL_JA[key],
        labelX: cx + rLabel * Math.cos(midDeg),
        labelY: cy + rLabel * Math.sin(midDeg),
        score,
      });
    }
    return list;
  }, [analysis, phase, compact, cx, cy, rMax]);

  const aria = analysis
    ? `プルチック感情。${PLUTCHIK_PRIMARY_ORDER.map((k) => `${PLUTCHIK_LABEL_JA[k]} ${analysis.primary[k].score}`).join("、")}`
    : phase === "loading"
      ? "感情を分析しています"
      : "プルチックの8感情の区分（未分析）。分析を実行するとスコアが表示されます";

  /** sm 以上は円環の右に凡例（各行は左から右へ＝ラベル＋スコアの横書き1行） */
  const outerClass = compact
    ? "inline-flex flex-col items-center gap-1"
    : analysis
      ? "flex w-full min-w-0 flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-4"
      : "flex flex-col items-center gap-2";

  return (
    <div className={outerClass}>
      <div
        className={
          compact
            ? "shrink-0"
            : "aspect-square w-[min(200px,min(72vw,20rem))] shrink-0 sm:h-[200px] sm:w-[200px] sm:max-w-none"
        }
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={aria}
          className={compact ? "shrink-0" : "h-full w-full max-w-full"}
        >
          <title>{aria}</title>
          {wedges.map((w) => (
            <g key={w.key}>
              <path
                d={w.path}
                fill={w.fill}
                fillOpacity={w.opacity}
                strokeWidth={compact ? 0.5 : !analysis && phase !== "loading" ? 1 : 0.75}
                className={
                  !analysis && phase !== "loading"
                    ? "stroke-zinc-500/45 motion-safe:transition-[fill-opacity,opacity] motion-safe:duration-500 motion-safe:ease-out dark:stroke-zinc-400/55"
                    : "stroke-black/[0.07] motion-safe:transition-[fill-opacity,opacity] motion-safe:duration-500 motion-safe:ease-out dark:stroke-white/[0.12]"
                }
              >
                <title>
                  {phase === "loading"
                    ? `${w.labelJa}（読み込み中）`
                    : `${w.labelJa} — スコア ${w.score}（0〜100）`}
                </title>
              </path>
              {!compact ? (
                <text
                  x={w.labelX}
                  y={w.labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={size >= 180 ? 10 : 7}
                  fontWeight={600}
                  className="pointer-events-none select-none"
                  fill="#fafafa"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={size >= 180 ? 1.25 : 0.9}
                  paintOrder="stroke fill"
                >
                  {w.labelJa}
                </text>
              ) : null}
            </g>
          ))}
          <circle cx={cx} cy={cy} r={compact ? 10 : 14} className="fill-zinc-100 dark:fill-zinc-900" />
        </svg>
      </div>
      {!compact && analysis ? (
        <div className="min-w-0 w-full max-w-full sm:w-[11rem] sm:max-w-[11rem] sm:shrink-0">
          <ul className="mx-auto w-full max-w-[11rem] list-none space-y-0 text-left text-[10px] leading-tight text-zinc-600 sm:mx-0 dark:text-zinc-400">
            {PLUTCHIK_PRIMARY_ORDER.map((k) => (
              <li
                key={k}
                className="flex justify-between gap-2 border-b border-zinc-100 py-0.5 last:border-b-0 dark:border-zinc-800"
              >
                <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-200">{PLUTCHIK_LABEL_JA[k]}</span>
                <span className="shrink-0 tabular-nums text-zinc-500">{analysis.primary[k].score}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
