"use client";

import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { UserProfileSettings } from "@/lib/user-settings";
import {
  AI_ADDRESS_STYLE_OPTIONS,
  avoidTopicChipsOrdered,
  AI_BUSY_WINDOW_OPTIONS,
  AI_CHAT_TONE_OPTIONS,
  AI_CURRENT_FOCUS_OPTIONS,
  AI_DEPTH_LEVEL_OPTIONS,
  AI_ENERGY_PEAK_OPTIONS,
  AI_HEALTH_COMFORT_OPTIONS,
  AI_HOUSEHOLD_OPTIONS,
} from "@/lib/agent-persona-preferences";

type Form = UserProfileSettings & { onboardingWorkLifeAnswers?: Record<string, string> };

export type AgentPersonaOnboardingWizardProps = {
  form: Form;
  patchForm: (next: Form) => void;
  /** 最後の「次へ」（メモのあと）で呼ぶ → 親は保存確認へ */
  onComplete: () => void;
  /** 親で管理（進捗バー連携・編集からの復帰用）0..10 */
  stepIndex: number;
  onStepIndexChange: Dispatch<SetStateAction<number>>;
};

const chipBase =
  "rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium leading-tight transition";
const chipOff =
  "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";
const chipOn =
  "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100";

function toggleInList(list: string[] | undefined, key: string, exclusiveNone: boolean): string[] {
  const cur = [...(list ?? [])];
  if (exclusiveNone && key === "none") {
    return cur.includes("none") ? [] : ["none"];
  }
  const withoutNone = exclusiveNone ? cur.filter((x) => x !== "none") : cur;
  const i = withoutNone.indexOf(key);
  if (i >= 0) {
    withoutNone.splice(i, 1);
    return withoutNone;
  }
  return [...withoutNone, key];
}

/** 本文＋ナビ。ナビは親（step8）のスクロール内で sticky し、長い画面では下に留まる */
function WizardLayout({ body, footer }: { body: ReactNode; footer: ReactNode }) {
  const tightTop = body == null;
  return (
    <div className={`flex min-h-0 w-full flex-col ${tightTop ? "gap-0" : "gap-2"}`}>
      <div className="min-w-0">{body}</div>
      <div
        className={`sticky bottom-0 z-[1] shrink-0 border-t border-zinc-100/90 bg-white/95 backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-950/95 ${tightTop ? "pt-1.5" : "pt-2"}`}
      >
        {footer}
      </div>
    </div>
  );
}

const selectCls =
  "mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

/** オンボーディングチャット用：AI との関わり方を1画面ずつ（進捗は親の OnboardingComposerProgress） */
export function AgentPersonaOnboardingWizard({
  form,
  patchForm,
  onComplete,
  stepIndex: idx,
  onStepIndexChange,
}: AgentPersonaOnboardingWizardProps) {
  const role = form.occupationRole ?? "";
  const household = form.aiHousehold ?? "";
  const ctx = { occupationRole: role, aiHousehold: household };

  const focusOptions = useMemo(
    () => AI_CURRENT_FOCUS_OPTIONS.filter((o) => !o.when || o.when({ occupationRole: role })),
    [role],
  );
  const avoidChipsOrdered = useMemo(() => avoidTopicChipsOrdered(ctx), [role, household]);

  const showStudentRhythmHint = role === "student";
  const showWorkerRhythmHint = role !== "" && role !== "student";
  const healthNone = form.aiHealthComfort === "none";

  const totalSteps = 11; // 0 intro … 10 memo

  function goNext() {
    onStepIndexChange((prev) => Math.min(prev + 1, totalSteps - 1));
  }

  function goBack() {
    onStepIndexChange((prev) => Math.max(0, prev - 1));
  }

  const nav =
    idx === 0 ? (
      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={goNext}
          className="min-w-[10rem] rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          はじめる
        </button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={goBack}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={goNext}
          className="min-w-[10rem] rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          次へ
        </button>
      </div>
    );

  if (idx === 0) {
    return (
      <WizardLayout body={null} footer={nav} />
    );
  }

  if (idx === 1) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">会話の中で、どう呼ばれたいですか？</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">未選択なら、特に指定しません。</p>
            <select
              value={form.aiAddressStyle ?? ""}
              onChange={(e) => patchForm({ ...form, aiAddressStyle: e.target.value })}
              className={selectCls}
            >
              {AI_ADDRESS_STYLE_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        }
        footer={nav}
      />
    );
  }

  if (idx === 2) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">AIの返し方のイメージに近いものは？</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">共感多め／短く要約、など好みに合わせられます。</p>
            <select
              value={form.aiChatTone ?? ""}
              onChange={(e) => patchForm({ ...form, aiChatTone: e.target.value })}
              className={selectCls}
            >
              {AI_CHAT_TONE_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        }
        footer={nav}
      />
    );
  }

  if (idx === 3) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">掘り下げの深さのイメージは？</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              深い話題は、あなたのペースを優先する設定も選べます。
            </p>
            <select
              value={form.aiDepthLevel ?? ""}
              onChange={(e) => patchForm({ ...form, aiDepthLevel: e.target.value })}
              className={selectCls}
            >
              {AI_DEPTH_LEVEL_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        }
        footer={nav}
      />
    );
  }

  if (idx === 4) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">いちばん元気が出やすい時間帯は？</p>
            {showStudentRhythmHint ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                授業や部活のイメージは、あなたが選んだ立場・学校まわりの回答とあわせて参照されます。
              </p>
            ) : null}
            {showWorkerRhythmHint ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                残業や締切が多いときは、次の「忙しい時間帯」で複数選ぶと言い回しが安定しやすいです。
              </p>
            ) : null}
            <select
              value={form.aiEnergyPeak ?? ""}
              onChange={(e) => patchForm({ ...form, aiEnergyPeak: e.target.value })}
              className={selectCls}
            >
              {AI_ENERGY_PEAK_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        }
        footer={nav}
      />
    );
  }

  if (idx === 5) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">特に手が離せない時間帯はありますか？</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">当てはまるものをタップ（複数可）。なければそのまま次へ。</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {AI_BUSY_WINDOW_OPTIONS.map((o) => {
                const on = (form.aiBusyWindows ?? []).includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() =>
                      patchForm({
                        ...form,
                        aiBusyWindows: toggleInList(form.aiBusyWindows, o.value, false),
                      })
                    }
                    className={`${chipBase} ${on ? chipOn : chipOff}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        }
        footer={nav}
      />
    );
  }

  if (idx === 6) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">暮らしの形に近いものはありますか？</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              答えたくなければ「答えたくない」のままでOKです。あとで「避けたい話題」の候補が変わります。
            </p>
            <select
              value={form.aiHousehold ?? ""}
              onChange={(e) => patchForm({ ...form, aiHousehold: e.target.value })}
              className={selectCls}
            >
              {AI_HOUSEHOLD_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        }
        footer={nav}
      />
    );
  }

  if (idx === 7) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">健康や体調の話題は、どこまで触れてほしいですか？</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              医療の判断や診断は行いません。保存はアプリ内の文脈づくりにだけ使います。
            </p>
            <select
              value={form.aiHealthComfort ?? ""}
              onChange={(e) => patchForm({ ...form, aiHealthComfort: e.target.value })}
              className={selectCls}
            >
              {AI_HEALTH_COMFORT_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {healthNone ? (
              <p className="mt-2 rounded-lg bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300">
                体調や病気の具体的な話題は扱わない設定になります。
              </p>
            ) : null}
          </div>
        }
        footer={nav}
      />
    );
  }

  if (idx === 8) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">触れてほしくないテーマはありますか？</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              「特に避けたいものはない」を選ぶと、ほかの選択は外れます。
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {avoidChipsOrdered.map((o) => {
                const on = (form.aiAvoidTopics ?? []).includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() =>
                      patchForm({
                        ...form,
                        aiAvoidTopics: toggleInList(form.aiAvoidTopics, o.value, true),
                      })
                    }
                    className={`${chipBase} ${on ? chipOn : chipOff}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        }
        footer={nav}
      />
    );
  }

  if (idx === 9) {
    return (
      <WizardLayout
        body={
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">いま頭に置いているテーマはありますか？</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">複数選べます。変わりやすいので、あとから設定でも直せます。</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {focusOptions.map((o) => {
                const on = (form.aiCurrentFocus ?? []).includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() =>
                      patchForm({
                        ...form,
                        aiCurrentFocus: toggleInList(form.aiCurrentFocus, o.value, false),
                      })
                    }
                    className={`${chipBase} ${on ? chipOn : chipOff}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        }
        footer={nav}
      />
    );
  }

  // idx === 10: memo
  const memoFooter = (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
      <button
        type="button"
        onClick={goBack}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
      >
        戻る
      </button>
      <button
        type="button"
        onClick={onComplete}
        className="mx-auto block min-w-[10rem] rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        次へ
      </button>
    </div>
  );

  return (
    <WizardLayout
      body={
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">そのほか、伝えておきたいことはありますか？</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            ここに書いた内容は、AIがあなたの文脈をつかむときの参考にします（任意）。
          </p>
          <textarea
            value={form.preferences ?? ""}
            onChange={(e) => patchForm({ ...form, preferences: e.target.value })}
            rows={4}
            placeholder="例：敬語が苦手なのでタメ口希望、など"
            className="mt-2 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
      }
      footer={memoFooter}
    />
  );
}
