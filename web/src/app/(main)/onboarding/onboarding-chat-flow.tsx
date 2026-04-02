"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { InterestPicksControl } from "@/components/interest-picks-control";
import { MBTI_16 } from "@/lib/mbti";
import { westernZodiacJaFromYmd } from "@/lib/zodiac-western";

type Bubble = { role: "assistant" | "user"; content: string };

function BubbleRow({ role, children }: { role: "assistant" | "user"; children: ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(100%,24rem)] rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? "rounded-br-md bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
            : "rounded-bl-md border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

const BLOOD = ["", "A", "B", "O", "AB", "不明"] as const;

export function OnboardingChatFlow({
  onDone,
  onOpenFormMode,
}: {
  onDone: () => void;
  onOpenFormMode?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [log, setLog] = useState<Bubble[]>([
    {
      role: "assistant",
      content:
        "はじめまして。日記アプリでの振り返りが少し楽になるよう、プロフィールを伺います。すべてスキップもできます。まず、お呼びする名前やニックネームはありますか？（任意）",
    },
  ]);

  const [nickname, setNickname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const zodiac = useMemo(() => (birthDate ? westernZodiacJaFromYmd(birthDate) : null), [birthDate]);
  const [mbti, setMbti] = useState("");
  const [loveMbti, setLoveMbti] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [interestPicks, setInterestPicks] = useState<string[]>([]);
  const [preferences, setPreferences] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pushUser(text: string) {
    setLog((L) => [...L, { role: "user", content: text }]);
  }

  function pushAssistant(text: string) {
    setLog((L) => [...L, { role: "assistant", content: text }]);
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      const zOut = birthDate ? (zodiac ?? "") : "";
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            nickname: nickname.trim() ?? "",
            birthDate: birthDate ?? "",
            zodiac: zOut,
            bloodType: bloodType ?? "",
            education: "",
            mbti: mbti ?? "",
            loveMbti: loveMbti ?? "",
            hobbies: "",
            interests: "",
            interestPicks,
            preferences: preferences.trim() ?? "",
          },
          finalizeOnboarding: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  function nextFromNickname() {
    const t = nickname.trim();
    pushUser(t ? `ニックネーム: ${t}` : "（未入力）");
    pushAssistant(
      "ありがとうございます。生年月日を教えてください。星座は自動で表示されます（任意・スキップ可）。",
    );
    setStep(1);
  }

  function nextFromBirth() {
    pushUser(
      birthDate
        ? `生年月日: ${birthDate}${zodiac ? `（${zodiac}）` : ""}`
        : "（スキップ）",
    );
    pushAssistant("MBTI のタイプを選んでください（任意・16タイプ）。");
    setStep(2);
  }

  function nextFromMbti() {
    pushUser(mbti ? `MBTI: ${mbti}` : "（スキップ）");
    pushAssistant("恋愛・対人スタイルとしての MBTI（16タイプ）を選んでください（任意）。");
    setStep(3);
  }

  function nextFromLoveMbti() {
    pushUser(loveMbti ? `恋愛MBTI: ${loveMbti}` : "（スキップ）");
    pushAssistant("血液型があれば選んでください（任意）。");
    setStep(4);
  }

  function nextFromBlood() {
    pushUser(bloodType ? `血液型: ${bloodType}` : "（スキップ）");
    pushAssistant("趣味・関心に近いものを選んでください。大分類を切り替えると、関連する候補が出ます（複数選択可・任意）。");
    setStep(5);
  }

  function nextFromInterests() {
    pushUser(
      interestPicks.length > 0
        ? `関心タグ: ${interestPicks.length} 件選択`
        : "（未選択）",
    );
    pushAssistant("その他、AI に伝えておきたいことがあれば自由にどうぞ（任意）。");
    setStep(6);
  }

  function nextFromPrefs() {
    pushUser(preferences.trim() ? preferences.trim().slice(0, 200) + (preferences.length > 200 ? "…" : "") : "（なし）");
    pushAssistant("入力内容を保存して、はじめにページを完了しますか？");
    setStep(7);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="max-h-[min(55vh,480px)] space-y-3 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        {log.map((b, i) => (
          <BubbleRow key={i} role={b.role}>
            <p className="whitespace-pre-wrap leading-relaxed">{b.content}</p>
          </BubbleRow>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {step === 0 && (
        <div className="space-y-2">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="ニックネーム（任意）"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            onClick={() => nextFromNickname()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            次へ
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          {zodiac && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              星座: <span className="font-medium text-zinc-900 dark:text-zinc-100">{zodiac}</span>（自動）
            </p>
          )}
          <button
            type="button"
            onClick={() => nextFromBirth()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            次へ
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <select
            value={mbti}
            onChange={(e) => setMbti(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">選ばない</option>
            {MBTI_16.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => nextFromMbti()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            次へ
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <select
            value={loveMbti}
            onChange={(e) => setLoveMbti(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">選ばない</option>
            {MBTI_16.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => nextFromLoveMbti()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            次へ
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          <select
            value={bloodType}
            onChange={(e) => setBloodType(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {BLOOD.map((b) => (
              <option key={b || "empty"} value={b}>
                {b || "選ばない"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => nextFromBlood()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            次へ
          </button>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <InterestPicksControl value={interestPicks} onChange={setInterestPicks} />
          <button
            type="button"
            onClick={() => nextFromInterests()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            次へ
          </button>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-2">
          <textarea
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            rows={4}
            placeholder="好み・メモ（任意）"
            className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            onClick={() => nextFromPrefs()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            次へ
          </button>
        </div>
      )}

      {step === 7 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveAll()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存して今日へ"}
          </button>
          {onOpenFormMode && (
            <button
              type="button"
              onClick={onOpenFormMode}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
            >
              フォームで直す
            </button>
          )}
        </div>
      )}

      {step < 7 && onOpenFormMode && (
        <p className="text-center text-xs text-zinc-500">
          <button type="button" onClick={onOpenFormMode} className="underline">
            一覧フォームで入力する
          </button>
        </p>
      )}
    </div>
  );
}
