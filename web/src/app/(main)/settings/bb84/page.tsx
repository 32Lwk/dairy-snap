"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/** 教育用の BB84 シミュレーション（量子物理の厳密再現ではありません） */
export default function Bb84Page() {
  const [bits, setBits] = useState<number[]>(() => randomBits(16));
  const [basesA, setBasesA] = useState<number[]>(() => randomBases(16));
  const [basesB, setBasesB] = useState<number[]>(() => randomBases(16));

  const sifted = useMemo(() => {
    return bits.map((b, i) => (basesA[i] === basesB[i] ? b : null));
  }, [bits, basesA, basesB]);

  const keyBits = sifted.filter((x) => x !== null) as number[];

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/settings" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← 設定
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">BB84 シミュレーション</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        これは学習用の疑似乱数シミュレーションです。実機の量子通信やセキュリティ評価には使えません。
      </p>

      <div className="mt-6 space-y-3 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p>
          Alice がビット列と基底を選び、Bob が独立に基底を測定します。基底が一致したビットだけが鍵候補（情報調和）になります。
        </p>
        <button
          type="button"
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white dark:bg-zinc-100 dark:text-zinc-900"
          onClick={() => {
            setBits(randomBits(16));
            setBasesA(randomBases(16));
            setBasesB(randomBases(16));
          }}
        >
          再実行
        </button>
      </div>

      <div className="mt-6 font-mono text-xs text-zinc-700 dark:text-zinc-300">
        <div>bits: {bits.join("")}</div>
        <div>A基底: {basesA.map((b) => (b ? "+" : "×")).join(" ")}</div>
        <div>B基底: {basesB.map((b) => (b ? "+" : "×")).join(" ")}</div>
        <div className="mt-2">一致したビット（候補鍵）: {keyBits.join("") || "—"}</div>
      </div>
    </div>
  );
}

function randomBits(n: number) {
  return Array.from({ length: n }, () => (Math.random() < 0.5 ? 0 : 1));
}

function randomBases(n: number) {
  return Array.from({ length: n }, () => (Math.random() < 0.5 ? 0 : 1));
}
