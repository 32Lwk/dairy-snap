"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgentPersonaPreferences } from "@/components/agent-persona-preferences";
import { InterestPicksControl } from "@/components/interest-picks-control";
import { ageYearsFromYmd, localYmdToday, sanitizeHtmlDateYmd } from "@/lib/age-from-ymd";
import {
  LOVE_MBTI_16,
  LOVE_MBTI_AXES_JA,
  LOVE_MBTI_TEST_URL_JA,
  loveMbtiDisplayJa,
} from "@/lib/love-mbti";
import { MBTI_16, MBTI_AXES_JA, MBTI_TEST_URL_JA, mbtiDisplayJa } from "@/lib/mbti";
import { PrefecturePickWithChips } from "@/components/prefecture-pick-with-chips";
import { SchoolSearchFields } from "@/components/school-search-fields";
import { TimetableEditor } from "@/components/timetable-editor";
import { TimetableEditorSheetPanel } from "@/components/timetable-editor-sheet-panel";
import { FancySelect } from "@/components/fancy-select";
import { ONBOARDING_GENDER_OPTIONS } from "@/lib/onboarding-chat-messages";
import {
  CO_INDUSTRY_OPTIONS,
  CO_STYLE_OPTIONS,
  COMMUTE_OPTIONS,
  composeWorkLifePayload,
  decodeSchoolWorkManual,
  decodeSchoolWorkPick,
  EDU_LEVEL_OPTIONS,
  eduLevelOptionsForRole,
  encodeParttimeIndustryStored,
  encodeSchoolWorkAnswer,
  HM_FOCUS_OPTIONS,
  JS_OPTIONS,
  ORIGIN_OPTIONS,
  PARTTIME_INDUSTRY_OPTIONS,
  PARTTIME_OPTIONS,
  parseParttimeIndustryStored,
  PREFECTURE_OPTIONS,
  prefectureOptionsForOriginRegion,
  PS_FIELD_OPTIONS,
  roleAsksParttimeHistory,
  SE_STYLE_OPTIONS,
  ST_HOME_STYLE_OPTIONS,
  ST_LEVEL_OPTIONS,
  ST_UNIV_FIELD_OPTIONS,
  ST_UNIV_YEAR_OPTIONS,
  type WorkLifeOption,
} from "@/lib/onboarding-work-life";
import { OCCUPATION_ROLE_OPTIONS } from "@/lib/occupation-role";
import { emptyTimetable, serializeTimetable } from "@/lib/timetable";
import { emitLocalSettingsSavedFromJson } from "@/lib/settings-sync-client";
import { InterestOfficialUrlsEditor } from "@/components/interest-official-urls-editor";
import { serializeProfileForApi, type UserProfileSettings } from "@/lib/user-settings";
import { westernZodiacJaFromYmd } from "@/lib/zodiac-western";

/** チャットと同じ `hi_pt_industry` 入力（`mode` でチップ／チェックを切替） */
function WorkLifeParttimeIndustry({
  mode,
  value,
  onChange,
  inputCls,
}: {
  mode: "chips" | "checkboxes";
  value: string;
  onChange: (next: string) => void;
  inputCls: string;
}) {
  const { tags, free } = useMemo(() => parseParttimeIndustryStored(value), [value]);
  const hint =
    mode === "chips"
      ? "タップで複数選べます（趣味嗜好と同じイメージ）。選ばなくてもよいです。"
      : "該当するものをすべて選べます。「その他」にチェックを入れると、枠内の下に詳細を書けます。";

  const setTags = (nextTags: string[], nextFree = free) => {
    onChange(encodeParttimeIndustryStored(nextTags, nextFree));
  };

  const chipBtn = (on: boolean) =>
    `rounded-lg border px-2 py-0.5 text-left text-[11px] font-medium leading-tight transition ${
      on
        ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
    }`;

  if (mode === "chips") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
        <div className="max-h-[min(34vh,200px)] overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
          <div className="flex flex-wrap gap-1.5">
            {PARTTIME_INDUSTRY_OPTIONS.map((o: WorkLifeOption) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  const on = tags.includes(o.value);
                  const nextTags = on ? tags.filter((x) => x !== o.value) : [...tags, o.value];
                  if (o.value === "other" && on) {
                    setTags(nextTags, "");
                  } else {
                    setTags(nextTags);
                  }
                }}
                className={chipBtn(tags.includes(o.value))}
              >
                {o.label}
              </button>
            ))}
          </div>
          {tags.includes("other") ? (
            <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
              店名・具体的な仕事（任意）
              <input
                type="text"
                value={free}
                onChange={(e) => setTags(tags, e.target.value)}
                placeholder="例：〇〇ドラッグのレジ、映画館の売店 など"
                className={`${inputCls} mt-1`}
              />
            </label>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-h-[min(34vh,200px)] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
        {PARTTIME_INDUSTRY_OPTIONS.map((o: WorkLifeOption) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg py-1 text-xs text-zinc-800 dark:text-zinc-100 sm:text-sm"
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0 rounded border-zinc-300 dark:border-zinc-600"
              checked={tags.includes(o.value)}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  setTags([...new Set([...tags, o.value])]);
                } else {
                  const next = tags.filter((x) => x !== o.value);
                  setTags(next, o.value === "other" ? "" : free);
                }
              }}
            />
            <span>{o.label}</span>
          </label>
        ))}
        {tags.includes("other") ? (
          <label className="block border-t border-zinc-100 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            店名・職種の詳細（任意）
            <input
              type="text"
              value={free}
              onChange={(e) => setTags(tags, e.target.value)}
              placeholder="例：〇〇ドラッグのレジ、映画館の売店、家電量販のイベントスタッフ など"
              className={`${inputCls} mt-1`}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

export type UserProfilePayload = UserProfileSettings & {
  /** オンボーディングのチャット↔フォーム同期用（保存 API には送らない） */
  onboardingWorkLifeAnswers?: Record<string, string>;
};

type Props = {
  initial: UserProfilePayload;
  /** 指定時は親が状態を保持（オンボーディングのチャット↔フォーム同期用） */
  value?: UserProfilePayload;
  onValuesChange?: (next: UserProfilePayload) => void;
  onSaved?: () => void;
  showTitle?: boolean;
  finalizeOnboarding?: boolean;
  /** タイトル横に表示（設定の「チャットで編集」など） */
  headerActions?: ReactNode;
};

const AUTO_SAVE_DEBOUNCE_MS = 800;

function patchBodyForProfile(profile: UserProfilePayload, finalizeOnboarding: boolean) {
  const birthYmd = sanitizeHtmlDateYmd(profile.birthDate ?? "");
  const zodiacOut = birthYmd ? westernZodiacJaFromYmd(birthYmd) ?? "" : "";
  const apiProfile = serializeProfileForApi(profile);
  return {
    profile: { ...apiProfile, zodiac: zodiacOut },
    ...(finalizeOnboarding ? { finalizeOnboarding: true } : {}),
  };
}

function fingerprintForProfile(profile: UserProfilePayload, finalizeOnboarding: boolean) {
  return JSON.stringify(patchBodyForProfile(profile, finalizeOnboarding));
}

export function UserProfileForm({
  initial,
  value,
  onValuesChange,
  onSaved,
  showTitle = true,
  finalizeOnboarding = false,
  headerActions,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentTimetableSheetOpen, setStudentTimetableSheetOpen] = useState(false);
  const sheetInnerBlurAtRef = useRef<number | null>(null);
  const sheetInnerInteractAtRef = useRef<number | null>(null);
  const sheetBackdropDownRef = useRef(false);
  const [internal, setInternal] = useState<UserProfilePayload>(initial);
  const controlled = value !== undefined && onValuesChange !== undefined;
  const form = controlled ? value : internal;
  const [birthEditMode, setBirthEditMode] = useState(false);
  const birthDateInputRef = useRef<HTMLInputElement | null>(null);

  const formRef = useRef(form);
  useLayoutEffect(() => {
    formRef.current = form;
  }, [form]);

  const lastSavedJsonRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeRef = useRef(finalizeOnboarding);
  const onSavedRef = useRef(onSaved);
  useLayoutEffect(() => {
    finalizeRef.current = finalizeOnboarding;
    onSavedRef.current = onSaved;
  }, [finalizeOnboarding, onSaved]);

  // useLayoutEffect だと親（設定画面）のマウント完了前に state 更新が走り、React 19 で警告になることがある
  useEffect(() => {
    if (!controlled) {
      setInternal(initial);
      lastSavedJsonRef.current = fingerprintForProfile(initial, finalizeOnboarding);
    }
  }, [initial, controlled, finalizeOnboarding]);

  useLayoutEffect(() => {
    if (controlled && lastSavedJsonRef.current === null) {
      lastSavedJsonRef.current = fingerprintForProfile(form, finalizeOnboarding);
    }
  }, [controlled, form, finalizeOnboarding]);

  const persistIfDirty = useCallback(async () => {
    while (true) {
      const body = patchBodyForProfile(formRef.current, finalizeRef.current);
      const fp = JSON.stringify(body);
      if (fp === lastSavedJsonRef.current) return;

      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: fp,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
          return;
        }
        lastSavedJsonRef.current = fp;
        emitLocalSettingsSavedFromJson(json);
        onSavedRef.current?.();
      } catch {
        setError("保存に失敗しました（ネットワークエラー）");
        return;
      } finally {
        setSaving(false);
      }
    }
  }, []);

  useEffect(() => {
    const fp = fingerprintForProfile(form, finalizeOnboarding);
    if (fp === lastSavedJsonRef.current) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void persistIfDirty();
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [form, finalizeOnboarding, persistIfDirty]);

  useEffect(() => {
    const flush = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void persistIfDirty();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [persistIfDirty]);

  const workLife = form.onboardingWorkLifeAnswers ?? {};

  const studentTimetableStored = workLife.st_timetable_note ?? "";
  const studentTimetableEditorValue = useMemo(
    () =>
      studentTimetableStored.trim() ? studentTimetableStored : serializeTimetable(emptyTimetable()),
    [studentTimetableStored],
  );
  useEffect(() => {
    if (!studentTimetableSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [studentTimetableSheetOpen]);

  const hiOriginPrefOptions = useMemo(
    () => prefectureOptionsForOriginRegion(workLife.hi_origin ?? ""),
    [workLife.hi_origin],
  );

  const occRole = form.occupationRole ?? "";

  useEffect(() => {
    if (occRole !== "student") setStudentTimetableSheetOpen(false);
  }, [occRole]);

  const asksParttimeHist = roleAsksParttimeHistory(occRole);
  /** 立場専用の先頭カードあり（その他・未選択は履歴カード内に「いまの住まい」を出す） */
  const roleHasIntroWorkLifeCard =
    occRole === "company" ||
    occRole === "public_sector" ||
    occRole === "self_employed" ||
    occRole === "homemaker" ||
    occRole === "job_seeking";
  const hiHomePrefInHistoryBlock = !roleHasIntroWorkLifeCard;

  /** 年の桁あふれなどを除いた YYYY-MM-DD（表示・星座・年齢の共通値） */
  const birthYmdForUi = useMemo(
    () => sanitizeHtmlDateYmd(form.birthDate ?? ""),
    [form.birthDate],
  );

  const zodiacAuto = useMemo(
    () => (birthYmdForUi ? westernZodiacJaFromYmd(birthYmdForUi) : null),
    [birthYmdForUi],
  );

  const ageAuto = useMemo(
    () => (birthYmdForUi ? ageYearsFromYmd(birthYmdForUi) : null),
    [birthYmdForUi],
  );

  const weekdayAuto = useMemo(() => {
    if (!birthYmdForUi) return null;
    const [ys, ms, ds] = birthYmdForUi.split("-");
    const y = Number(ys);
    const m = Number(ms);
    const d = Number(ds);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(dt);
  }, [birthYmdForUi]);

  const birthDisplayText = useMemo(() => {
    if (!birthYmdForUi) return "";
    const [y, m, d] = birthYmdForUi.split("-");
    const base = `${y}/${m}/${d}`;
    return weekdayAuto ? `${base}（${weekdayAuto}）` : base;
  }, [birthYmdForUi, weekdayAuto]);

  useEffect(() => {
    if (!birthEditMode) return;
    birthDateInputRef.current?.focus();
  }, [birthEditMode]);

  function patchForm(next: UserProfilePayload) {
    if (controlled) onValuesChange!(next);
    else setInternal(next);
  }

  /** 保存済みやブラウザ差で年が5桁以上になった値を4桁に揃えて状態へ反映 */
  useEffect(() => {
    const cur = form.birthDate;
    if (cur == null || cur === "") return;
    const fixed = sanitizeHtmlDateYmd(cur);
    if (fixed !== cur) {
      patchForm({ ...form, birthDate: fixed || undefined });
    }
  }, [form.birthDate]);

  function set<K extends keyof UserProfilePayload>(key: K, val: UserProfilePayload[K]) {
    patchForm({ ...form, [key]: val });
  }

  /** チャット型オンボーディングと同じキーで同期（occupationNote / studentLifeNotes / education も compose） */
  function patchOnboardingWorkLife(patch: Record<string, string>) {
    const prev = form.onboardingWorkLifeAnswers ?? {};
    const next = { ...prev, ...patch };
    const composed = composeWorkLifePayload(form.occupationRole ?? "", next);
    patchForm({
      ...form,
      onboardingWorkLifeAnswers: next,
      occupationNote: composed.occupationNote,
      studentLifeNotes: composed.studentLifeNotes,
      education: composed.education,
    });
  }

  function setOccupationRole(role: string) {
    const next = form.onboardingWorkLifeAnswers ?? {};
    const composed = composeWorkLifePayload(role, next);
    patchForm({
      ...form,
      occupationRole: role,
      occupationNote: composed.occupationNote,
      studentLifeNotes: composed.studentLifeNotes,
      education: composed.education,
    });
  }

  function patchHiOrigin(nextOrigin: string) {
    const opts = prefectureOptionsForOriginRegion(nextOrigin);
    const allow = new Set(opts.map((o) => o.value));
    const curPref = workLife.hi_origin_pref ?? "";
    if (curPref && !allow.has(curPref)) {
      patchOnboardingWorkLife({ hi_origin: nextOrigin, hi_origin_pref: "" });
    } else {
      patchOnboardingWorkLife({ hi_origin: nextOrigin });
    }
  }

  async function save() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    await persistIfDirty();
  }

  const inputCls =
    "mt-0.5 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] leading-snug dark:border-zinc-700 dark:bg-zinc-950 sm:text-xs md:text-sm";

  const homePrefBlock = (
    <div className="mt-3">
      <PrefecturePickWithChips
        questionId="hi_home_pref"
        workAnswers={workLife}
        value={workLife.hi_home_pref ?? ""}
        onChange={(v) => patchOnboardingWorkLife({ hi_home_pref: v })}
        selectOptions={PREFECTURE_OPTIONS}
        label="いま主に住んでいる都道府県に近いものはどれですか？（任意・1つ）一覧は全国固定順。出身県と同じなら候補チップから選べます。"
        inputCls={inputCls}
      />
    </div>
  );

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      {showTitle && (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50 sm:text-base">プロフィール（任意）</h2>
            {headerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div> : null}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-xs">
            振り返りチャットの文脈に使います。生年月日を入れると星座を自動入力します。
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-600 sm:text-sm">{error}</p>}

      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        ニックネーム
        <input
          value={form.nickname ?? ""}
          onChange={(e) => set("nickname", e.target.value)}
          className={inputCls}
          placeholder="お呼びする名前（OAuth の表示名とは別でも可）"
        />
      </label>

      <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          生年月日
          <div className="relative">
            {birthEditMode ? (
              <input
                ref={birthDateInputRef}
                aria-label="生年月日"
                type="date"
                min="1900-01-01"
                max={localYmdToday()}
                value={birthYmdForUi}
                onChange={(e) => {
                  const v = sanitizeHtmlDateYmd(e.target.value);
                  set("birthDate", v ? v : undefined);
                }}
                onBlur={() => setBirthEditMode(false)}
                className={inputCls}
              />
            ) : (
              <>
                <div className={`${inputCls} flex items-center pr-10`}>
                  {birthDisplayText ? (
                    <span className="text-zinc-900 dark:text-zinc-50">{birthDisplayText}</span>
                  ) : (
                    <span className="text-zinc-400 dark:text-zinc-600">YYYY/MM/DD</span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="生年月日を編集"
                  onClick={() => setBirthEditMode(true)}
                  className="absolute inset-0 h-full w-full cursor-text rounded-lg"
                />
              </>
            )}
          </div>
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
          満年齢（自動）
          <input
            value={ageAuto != null ? String(ageAuto) : ""}
            readOnly
            className={`${inputCls} cursor-not-allowed bg-zinc-50 dark:bg-zinc-900/80`}
            placeholder="生年月日を入力すると表示"
          />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          性別
          <FancySelect
            value={form.gender ?? ""}
            onChange={(e) => set("gender", e.target.value)}
            className={inputCls}
          >
            {ONBOARDING_GENDER_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </FancySelect>
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          血液型
          <FancySelect
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
          </FancySelect>
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          職業・立場
          <FancySelect
            value={form.occupationRole ?? ""}
            onChange={(e) => setOccupationRole(e.target.value)}
            className={inputCls}
          >
            {OCCUPATION_ROLE_OPTIONS.map((o) => (
              <option key={o.value || "empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </FancySelect>
        </label>
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800 sm:col-span-2">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            職種・業種・働き方（チャットと同じ・選択から自動）
          </p>
          {(() => {
            const occ = form.occupationNote?.trim() ?? "";
            const stu = form.studentLifeNotes?.trim() ?? "";
            /** 学生は compose が studentLifeNotes にまとまり occupationNote は空になりがち */
            const summary =
              form.occupationRole === "student" ? stu || occ : occ || stu;
            return summary ? (
              <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300 sm:text-sm">
                {summary}
              </p>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-xs">
                「職業・立場」に応じた質問に答えると、ここに要約が入ります（学生は学校・通学などがここにまとまります）。
              </p>
            );
          })()}
        </div>

        {form.occupationRole === "student" && (
          <div className="space-y-3 sm:col-span-2">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                学校・通学・居住（チャットと同じ順・入力形式）
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                学校の段階に近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.st_level ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ st_level: e.target.value })}
                  className={inputCls}
                >
                  {ST_LEVEL_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <div className="mt-3">
                <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">学校名を教えてください。（任意）</p>
                <SchoolSearchFields
                  compact
                  stLevel={workLife.st_level ?? ""}
                  selected={decodeSchoolWorkPick(workLife.st_school ?? "")}
                  manual={decodeSchoolWorkManual(workLife.st_school ?? "")}
                  onSelectedChange={(hit) => {
                    if (hit) {
                      patchOnboardingWorkLife({ st_school: encodeSchoolWorkAnswer(hit, "") });
                      return;
                    }
                    const man = decodeSchoolWorkManual(workLife.st_school ?? "");
                    patchOnboardingWorkLife({ st_school: encodeSchoolWorkAnswer(null, man) });
                  }}
                  onManualChange={(t) => {
                    const trimmed = t.trim();
                    if (trimmed) {
                      patchOnboardingWorkLife({ st_school: encodeSchoolWorkAnswer(null, t) });
                      return;
                    }
                    const pick = decodeSchoolWorkPick(workLife.st_school ?? "");
                    patchOnboardingWorkLife({
                      st_school: pick ? encodeSchoolWorkAnswer(pick, "") : "",
                    });
                  }}
                />
              </div>
              <label className="mt-3 block text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-xs">
                学年・年次に近いものはどれですか？（大学・大学院生のみ。該当しない場合は選ばない）
                <FancySelect
                  value={workLife.st_univ_year ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ st_univ_year: e.target.value })}
                  className={inputCls}
                >
                  {ST_UNIV_YEAR_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <label className="block text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-xs">
                学部・学科・学問領域に近いものはどれですか？（大学・大学院生のみ。該当しない場合は選ばない）
                <FancySelect
                  value={workLife.st_univ_field ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ st_univ_field: e.target.value })}
                  className={inputCls}
                >
                  {ST_UNIV_FIELD_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                いまの住まいに近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.st_home_style ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ st_home_style: e.target.value })}
                  className={inputCls}
                >
                  {ST_HOME_STYLE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <div className="mt-2">
                <PrefecturePickWithChips
                  questionId="st_home_pref"
                  workAnswers={workLife}
                  value={workLife.st_home_pref ?? ""}
                  onChange={(v) => patchOnboardingWorkLife({ st_home_pref: v })}
                  selectOptions={PREFECTURE_OPTIONS}
                  label="いま主に住んでいる都道府県に近いものはどれですか？（任意・1つ）"
                  inputCls={inputCls}
                />
              </div>
              <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                通学の所要時間や移動のイメージに近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.st_commute ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ st_commute: e.target.value })}
                  className={inputCls}
                >
                  {COMMUTE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                時間割を表で入力してください（任意）。
              </p>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                オンボーディングのチャットと同じく、下のボタンから下にスライドする画面で入力できます。下は編集画面と同じ見た目のプレビューです。
              </p>
              <div className="mt-2 max-h-[min(50dvh,360px)] overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
                <div className="max-h-[inherit] overflow-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
                  <TimetableEditor
                    readOnly
                    compact
                    value={studentTimetableEditorValue}
                    onChange={() => {}}
                    stLevel={workLife.st_level ?? ""}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStudentTimetableSheetOpen(true)}
                className="mt-2 w-full rounded-xl border border-emerald-600 bg-emerald-50 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50 sm:py-2.5 sm:text-sm"
              >
                時間割を入力・編集
              </button>
              {studentTimetableSheetOpen && typeof document !== "undefined" ? (
                <div
                  className="fixed inset-0 z-[210] flex flex-col items-center justify-end"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="profile-timetable-sheet-title"
                >
                  <div
                    className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
                    aria-label="閉じる"
                    role="presentation"
                    onPointerDown={(e) => {
                      sheetBackdropDownRef.current = e.target === e.currentTarget;
                    }}
                    onPointerUp={(e) => {
                      if (!sheetBackdropDownRef.current) return;
                      sheetBackdropDownRef.current = false;
                      if (e.target !== e.currentTarget) return;

                      const now = Date.now();
                      const lastBlur = sheetInnerBlurAtRef.current;
                      const lastInteract = sheetInnerInteractAtRef.current;
                      const recent =
                        (lastBlur != null && now - lastBlur < 450) ||
                        (lastInteract != null && now - lastInteract < 450);
                      if (recent) return;

                      setStudentTimetableSheetOpen(false);
                    }}
                  />
                  <div className="relative z-10 w-full min-w-0 max-w-lg px-4">
                    <div className="flex max-h-[90dvh] min-h-0 flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
                      <TimetableEditorSheetPanel
                        titleId="profile-timetable-sheet-title"
                        title="時間割"
                        value={studentTimetableEditorValue}
                        onChange={(v) => patchOnboardingWorkLife({ st_timetable_note: v })}
                        stLevel={workLife.st_level ?? ""}
                        showSaveFooter={false}
                        interactionGuard
                        guardTimestampRefs={{
                          blurAt: sheetInnerBlurAtRef,
                          interactAt: sheetInnerInteractAtRef,
                        }}
                        onRequestClose={() => setStudentTimetableSheetOpen(false)}
                        closeButtonClassName="rounded-lg px-2 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                        className="flex max-h-[inherit] min-h-0 flex-col overflow-hidden bg-white dark:bg-zinc-950"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                育ち・出身・学歴・アルバイト（チャットの続きと同じ）
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                育ちや出身に近い地域はどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.hi_origin ?? ""}
                  onChange={(e) => patchHiOrigin(e.target.value)}
                  className={inputCls}
                >
                  {ORIGIN_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <div className="mt-2">
                <PrefecturePickWithChips
                  questionId="hi_origin_pref"
                  workAnswers={workLife}
                  value={workLife.hi_origin_pref ?? ""}
                  onChange={(v) => patchOnboardingWorkLife({ hi_origin_pref: v })}
                  selectOptions={hiOriginPrefOptions}
                  label="出身に近い都道府県を選んでください。（任意・1つ）さきほど選んだ広域に含まれる都道府県だけが表示されます。"
                  inputCls={inputCls}
                />
              </div>
              <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                アルバイトやパートの経験に近いものはどれですか？（任意）
                <FancySelect
                  value={workLife.hi_part ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ hi_part: e.target.value })}
                  className={inputCls}
                >
                  {PARTTIME_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <div className="mt-3">
                <p className="mb-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-xs">
                  バイト・パートの内容に近いものを、チップから選んでください。（複数可。「その他」を選んだときは下の欄に書けます）
                </p>
                <WorkLifeParttimeIndustry
                  mode="chips"
                  value={workLife.hi_pt_industry ?? ""}
                  onChange={(next) => patchOnboardingWorkLife({ hi_pt_industry: next })}
                  inputCls={inputCls}
                />
              </div>
            </div>
          </div>
        )}

        {form.occupationRole === "company" && (
          <div className="space-y-3 sm:col-span-2">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                会社員・派遣など（チャットと同じ順）
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                お仕事の業種に近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.co_industry ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ co_industry: e.target.value })}
                  className={inputCls}
                >
                  {CO_INDUSTRY_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                働き方に近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.co_style ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ co_style: e.target.value })}
                  className={inputCls}
                >
                  {CO_STYLE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                通勤に近いイメージはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.co_commute ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ co_commute: e.target.value })}
                  className={inputCls}
                >
                  {COMMUTE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              {homePrefBlock}
            </div>
          </div>
        )}

        {form.occupationRole === "public_sector" && (
          <div className="space-y-3 sm:col-span-2">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                公務員・教員など（チャットと同じ順）
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                分野に近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.ps_field ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ ps_field: e.target.value })}
                  className={inputCls}
                >
                  {PS_FIELD_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                通勤に近いイメージはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.ps_commute ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ ps_commute: e.target.value })}
                  className={inputCls}
                >
                  {COMMUTE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              {homePrefBlock}
            </div>
          </div>
        )}

        {form.occupationRole === "self_employed" && (
          <div className="space-y-3 sm:col-span-2">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                自営・フリーランス（チャットと同じ順）
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                活動の形に近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.se_style ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ se_style: e.target.value })}
                  className={inputCls}
                >
                  {SE_STYLE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                移動や通勤のイメージに近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.se_commute ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ se_commute: e.target.value })}
                  className={inputCls}
                >
                  {COMMUTE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              {homePrefBlock}
            </div>
          </div>
        )}

        {form.occupationRole === "homemaker" && (
          <div className="space-y-3 sm:col-span-2">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                専業主婦・主夫など（チャットと同じ順）
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                いま中心になっていることに近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.hm_focus ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ hm_focus: e.target.value })}
                  className={inputCls}
                >
                  {HM_FOCUS_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              {homePrefBlock}
            </div>
          </div>
        )}

        {form.occupationRole === "job_seeking" && (
          <div className="space-y-3 sm:col-span-2">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                求職中・休職中（チャットと同じ順）
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                いまの状況に近いものはどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.js_situation ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ js_situation: e.target.value })}
                  className={inputCls}
                >
                  {JS_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              {homePrefBlock}
            </div>
          </div>
        )}

        {form.occupationRole !== "student" && (
          <div className="space-y-3 sm:col-span-2">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {hiHomePrefInHistoryBlock
                  ? "育ち・出身・住まい・学歴・アルバイト（チャットの続きと同じ）"
                  : "育ち・出身・学歴・アルバイト（チャットの続きと同じ）"}
              </p>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                育ちや出身に近い地域はどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.hi_origin ?? ""}
                  onChange={(e) => patchHiOrigin(e.target.value)}
                  className={inputCls}
                >
                  {ORIGIN_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              <div className="mt-2">
                <PrefecturePickWithChips
                  questionId="hi_origin_pref"
                  workAnswers={workLife}
                  value={workLife.hi_origin_pref ?? ""}
                  onChange={(v) => patchOnboardingWorkLife({ hi_origin_pref: v })}
                  selectOptions={hiOriginPrefOptions}
                  label="出身に近い都道府県を選んでください。（任意・1つ）さきほど選んだ広域に含まれる都道府県だけが表示されます。"
                  inputCls={inputCls}
                />
              </div>
              {hiHomePrefInHistoryBlock ? homePrefBlock : null}
              <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                いちばん近い学歴はどれですか？（任意・1つ）
                <FancySelect
                  value={workLife.hi_edu ?? ""}
                  onChange={(e) => patchOnboardingWorkLife({ hi_edu: e.target.value })}
                  className={inputCls}
                >
                  {EDU_LEVEL_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FancySelect>
              </label>
              {asksParttimeHist ? (
                <>
                  <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                    アルバイトやパートの経験に近いものはどれですか？（任意）
                    <FancySelect
                      value={workLife.hi_part ?? ""}
                      onChange={(e) => patchOnboardingWorkLife({ hi_part: e.target.value })}
                      className={inputCls}
                    >
                      {PARTTIME_OPTIONS.map((o) => (
                        <option key={o.value || "empty"} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </FancySelect>
                  </label>
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-xs">
                      バイト・パートの内容に近いものを、チップから選んでください。（複数可。「その他」を選んだときは下の欄に書けます）
                    </p>
                    <WorkLifeParttimeIndustry
                      mode="chips"
                      value={workLife.hi_pt_industry ?? ""}
                      onChange={(next) => patchOnboardingWorkLife({ hi_pt_industry: next })}
                      inputCls={inputCls}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        <label className="block text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          MBTI
        <FancySelect
            value={form.mbti ?? ""}
            onChange={(e) => set("mbti", e.target.value)}
            className={inputCls}
          >
            <option value="">選ばない</option>
            {MBTI_16.map((m) => (
              <option key={m} value={m}>
                {mbtiDisplayJa(m)}
              </option>
            ))}
        </FancySelect>
          <details className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <summary className="cursor-pointer select-none text-zinc-600 dark:text-zinc-300">
              4つの指標
            </summary>
            <ul className="mt-1 list-inside list-disc space-y-0.5 pl-0.5">
              {MBTI_AXES_JA.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
          <a
            href={MBTI_TEST_URL_JA}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[11px] text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
          >
            無料性格診断（16Personalities）
          </a>
        </label>
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">
          恋愛MBTI（恋愛キャラ16タイプ）
          <FancySelect
            value={form.loveMbti ?? ""}
            onChange={(e) => set("loveMbti", e.target.value)}
            className={inputCls}
          >
            <option value="">選ばない</option>
            {LOVE_MBTI_16.map((code) => (
              <option key={code} value={code}>
                {loveMbtiDisplayJa(code)}
              </option>
            ))}
          </FancySelect>
        </label>
        <details className="text-[11px] text-zinc-500 dark:text-zinc-400">
          <summary className="cursor-pointer select-none text-zinc-600 dark:text-zinc-300">
            4つの指標
          </summary>
          <ul className="mt-1 list-inside list-disc space-y-0.5 pl-0.5">
            {LOVE_MBTI_AXES_JA.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
        <a
          href={LOVE_MBTI_TEST_URL_JA}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[11px] text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
        >
          恋愛キャラ診断（lovecharacter64.jp）
        </a>
      </div>

      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">趣味・関心（選択）</p>
        <InterestPicksControl
          value={form.interestPicks ?? []}
          onChange={(next) => set("interestPicks", next)}
        />
      </div>

      <details className="rounded-xl border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
          趣味タグ向け公式 URL（上級・任意）
        </summary>
        <div className="border-t border-zinc-100 px-2 pb-2 pt-1 dark:border-zinc-800">
          <InterestOfficialUrlsEditor />
        </div>
      </details>

      <AgentPersonaPreferences form={form} patchForm={patchForm} />

      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        メモ
        <textarea
          value={form.preferences ?? ""}
          onChange={(e) => set("preferences", e.target.value)}
          rows={3}
          className={`${inputCls} resize-y`}
          placeholder="その他、AI に伝えておきたいこと"
        />
      </label>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 sm:px-4 sm:text-sm"
        >
          {saving ? "保存中…" : "今すぐ保存"}
        </button>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          変更は入力が止まってから約 {AUTO_SAVE_DEBOUNCE_MS / 1000}{" "}
          秒後に自動保存します。別タブ表示へ切り替えるとき・ページを離れる直前にも未送信の変更を送ります。
        </p>
      </div>
    </div>
  );
}
