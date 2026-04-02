"use client";

import { useEffect, useMemo, useState } from "react";
import { InterestPicksControl } from "@/components/interest-picks-control";
import { MBTI_16 } from "@/lib/mbti";
import { westernZodiacJaFromYmd } from "@/lib/zodiac-western";

export type UserProfilePayload = {
  nickname?: string;
  birthDate?: string;
  zodiac?: string;
  bloodType?: string;
  education?: string;
  mbti?: string;
  loveMbti?: string;
  hobbies?: string;
  interests?: string;
  interestPicks?: string[];
  preferences?: string;
  /** 読み取り専用（API 応答に含まれることがある） */
  onboardingCompletedAt?: string;
};

type Props = {
  initial: UserProfilePayload;
  onSaved?: () => void;
  showTitle?: boolean;
  finalizeOnboarding?: boolean;
};

export function UserProfileForm({
  initial,
  onSaved,
  showTitle = true,
  finalizeOnboarding = false,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UserProfilePayload>(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const zodiacAuto = useMemo(
    () => (form.birthDate ? westernZodiacJaFromYmd(form.birthDate) : null),
    [form.birthDate],
  );

  function set<K extends keyof UserProfilePayload>(key: K, value: UserProfilePayload[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const zodiacOut = form.birthDate ? (zodiacAuto ?? "") : "";
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            nickname: form.nickname?.trim() ?? "",
            birthDate: form.birthDate?.trim() ?? "",
            zodiac: zodiacOut,
            bloodType: form.bloodType?.trim() ?? "",
            education: form.education?.trim() ?? "",
            mbti: form.mbti?.trim() ?? "",
            loveMbti: form.loveMbti?.trim() ?? "",
            hobbies: form.hobbies?.trim() ?? "",
            interests: form.interests?.trim() ?? "",
            interestPicks: form.interestPicks ?? [],
            preferences: form.preferences?.trim() ?? "",
          },
          ...(finalizeOnboarding ? { finalizeOnboarding: true } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div className="space-y-4">
      {showTitle && (
        <div>
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">プロフィール（任意）</h2>
          <p className="mt-1 text-xs text-zinc-500">
            振り返りチャットの文脈に使います。生年月日を入れると星座を自動入力します。
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        ニックネーム
        <input
          value={form.nickname ?? ""}
          onChange={(e) => set("nickname", e.target.value)}
          className={inputCls}
          placeholder="お呼びする名前（OAuth の表示名とは別でも可）"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          生年月日
          <input
            type="date"
            value={form.birthDate ?? ""}
            onChange={(e) => set("birthDate", e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          星座（自動）
          <input
            value={zodiacAuto ?? form.zodiac ?? ""}
            readOnly
            className={`${inputCls} cursor-not-allowed bg-zinc-50 dark:bg-zinc-900/80`}
            placeholder="生年月日を入力すると表示"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          血液型
          <select
            value={form.bloodType ?? ""}
            onChange={(e) => set("bloodType", e.target.value)}
            className={inputCls}
          >
            <option value="">選ばない</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="O">O</option>
            <option value="AB">AB</option>
            <option value="不明">不明</option>
          </select>
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          MBTI
          <select
            value={form.mbti ?? ""}
            onChange={(e) => set("mbti", e.target.value)}
            className={inputCls}
          >
            <option value="">選ばない</option>
            {MBTI_16.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        恋愛MBTI（16タイプ）
        <select
          value={form.loveMbti ?? ""}
          onChange={(e) => set("loveMbti", e.target.value)}
          className={inputCls}
        >
          <option value="">選ばない</option>
          {MBTI_16.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        学歴・職業など
        <textarea
          value={form.education ?? ""}
          onChange={(e) => set("education", e.target.value)}
          rows={2}
          className={`${inputCls} resize-y`}
          placeholder="任意"
        />
      </label>

      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">趣味・関心（選択）</p>
        <InterestPicksControl
          value={form.interestPicks ?? []}
          onChange={(next) => set("interestPicks", next)}
        />
      </div>

      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        趣味（自由記述）
        <textarea
          value={form.hobbies ?? ""}
          onChange={(e) => set("hobbies", e.target.value)}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </label>

      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        嗜好・関心（自由記述）
        <textarea
          value={form.interests ?? ""}
          onChange={(e) => set("interests", e.target.value)}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </label>

      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        好み・メモ
        <textarea
          value={form.preferences ?? ""}
          onChange={(e) => set("preferences", e.target.value)}
          rows={3}
          className={`${inputCls} resize-y`}
          placeholder="その他、AI に伝えておきたいこと"
        />
      </label>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
