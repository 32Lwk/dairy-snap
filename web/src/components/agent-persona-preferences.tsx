"use client";

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
  AI_MEMORY_FORGET_BIAS_OPTIONS,
  AI_MEMORY_NAME_POLICY_OPTIONS,
  AI_MEMORY_RECALL_STYLE_OPTIONS,
} from "@/lib/agent-persona-preferences";

type AgentPersonaForm = UserProfileSettings & { onboardingWorkLifeAnswers?: Record<string, string> };

type Props = {
  form: AgentPersonaForm;
  patchForm: (next: AgentPersonaForm) => void;
};

const chipBase =
  "rounded-lg border px-2 py-1 text-left text-[11px] font-medium leading-tight transition";
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

export function AgentPersonaPreferences({ form, patchForm }: Props) {
  const role = form.occupationRole ?? "";
  const household = form.aiHousehold ?? "";
  const ctx = { occupationRole: role, aiHousehold: household };

  const focusOptions = AI_CURRENT_FOCUS_OPTIONS.filter((o) => !o.when || o.when({ occupationRole: role }));

  const avoidChipsOrdered = avoidTopicChipsOrdered(ctx);

  const showStudentRhythmHint = role === "student";
  const showWorkerRhythmHint = role !== "" && role !== "student";
  const healthNone = form.aiHealthComfort === "none";

  return (
    <div className="space-y-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div>
        <h3 className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
          AI との関わり方（任意・選択中心）
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
          日記や振り返りのトーンに使います。職業・暮らしの回答に合わせて、下の候補が一部変わります。
        </p>
      </div>

      <section className="space-y-2 border-t border-emerald-200/60 pt-3 dark:border-emerald-900/40">
        <p className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">1. 呼び方・トーン・掘り下げ</p>
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          呼び方
          <select
            value={form.aiAddressStyle ?? ""}
            onChange={(e) => patchForm({ ...form, aiAddressStyle: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_ADDRESS_STYLE_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          AI の話し方
          <select
            value={form.aiChatTone ?? ""}
            onChange={(e) => patchForm({ ...form, aiChatTone: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_CHAT_TONE_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          掘り下げの深さ（境界）
          <select
            value={form.aiDepthLevel ?? ""}
            onChange={(e) => patchForm({ ...form, aiDepthLevel: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_DEPTH_LEVEL_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-2 border-t border-emerald-200/60 pt-3 dark:border-emerald-900/40">
        <p className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">2. 生活リズム（ざっくり）</p>
        {showStudentRhythmHint ? (
          <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
            学生向けのヒント: 授業・部活・バイトのどれが多いかは、上の「職業・立場」や学校メモとあわせて参照します。
          </p>
        ) : null}
        {showWorkerRhythmHint ? (
          <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
            社会人向けのヒント: 残業や締切が多いときは「忙しめの時間帯」で複数選ぶと提案の言い回しが安定しやすいです。
          </p>
        ) : null}
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          いちばん元気な時間帯
          <select
            value={form.aiEnergyPeak ?? ""}
            onChange={(e) => patchForm({ ...form, aiEnergyPeak: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_ENERGY_PEAK_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">忙しめの時間帯（複数可）</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
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
      </section>

      <section className="space-y-2 border-t border-emerald-200/60 pt-3 dark:border-emerald-900/40">
        <p className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">3. 話題の希望</p>
        <div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">避けたい話題（複数可）</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
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
          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
            「特に避けたいものはない」を選ぶと、他の避けたい候補は外れます。
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400">いま関心が高いもの（複数可・更新しやすい）</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
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
      </section>

      <section className="space-y-2 border-t border-emerald-200/60 pt-3 dark:border-emerald-900/40">
        <p className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
          {"\u8a18\u61b6\u306e\u6271\u3044\uff08MAS\u30fb\u4efb\u610f\uff09"}
        </p>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          {
            "\u30c1\u30e3\u30c3\u30c8\u5f8c\u306e\u77ed\u671f\u30fb\u9577\u671f\u8a18\u61b6\u306e\u62bd\u51fa\u30fb\u53c2\u7167\u306e\u5f37\u3055\u306e\u76ee\u5b89\u3067\u3059\u3002\u65e5\u4ed8\u3054\u3068\u306e\u78ba\u8a8d\u306f\u8a2d\u5b9a\u306e\u300c\u8a18\u61b6\u306e\u78ba\u8a8d\u300d\u304b\u3089\u884c\u3048\u307e\u3059\u3002"
          }
        </p>
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          {"\u8a18\u61b6\u306e\u53c2\u7167\u30fb\u6d3b\u7528"}
          <select
            value={form.aiMemoryRecallStyle ?? ""}
            onChange={(e) => patchForm({ ...form, aiMemoryRecallStyle: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_MEMORY_RECALL_STYLE_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          {"\u56fa\u6709\u540d\u8a5e\u306e\u8a18\u61b6"}
          <select
            value={form.aiMemoryNamePolicy ?? ""}
            onChange={(e) => patchForm({ ...form, aiMemoryNamePolicy: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_MEMORY_NAME_POLICY_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          {"\u53e4\u3044\u63a8\u6e2c\u30fb\u77db\u76fe\u306e\u6574\u7406"}
          <select
            value={form.aiMemoryForgetBias ?? ""}
            onChange={(e) => patchForm({ ...form, aiMemoryForgetBias: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_MEMORY_FORGET_BIAS_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </section>


      <section className="space-y-2 border-t border-emerald-200/60 pt-3 dark:border-emerald-900/40">
        <p className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">4. 健康・暮らし（任意）</p>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          医療判断や診断は行いません。保存内容はサービス内の文脈づくりにのみ使います。
        </p>
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          健康の話題の扱い
          <select
            value={form.aiHealthComfort ?? ""}
            onChange={(e) => patchForm({ ...form, aiHealthComfort: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_HEALTH_COMFORT_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {healthNone ? (
          <p className="rounded-md bg-white/80 px-2 py-1 text-[10px] text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400">
            設定どおり、体調や病気の具体的な話題は扱いません。
          </p>
        ) : null}
        <label className="block text-[11px] text-zinc-600 dark:text-zinc-400">
          暮らしのざっくり
          <select
            value={form.aiHousehold ?? ""}
            onChange={(e) => patchForm({ ...form, aiHousehold: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {AI_HOUSEHOLD_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {household === "kids" || household === "parents" || household === "mixed" ? (
          <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
            上の「避けたい話題」に、育児・介護・学校の細部を避ける候補を出しています。必要なだけ選んでください。
          </p>
        ) : null}
      </section>
    </div>
  );
}
