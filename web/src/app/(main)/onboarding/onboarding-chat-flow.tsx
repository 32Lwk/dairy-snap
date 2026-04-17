"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { UserProfilePayload } from "@/components/user-profile-form";
import { AgentPersonaOnboardingWizard } from "@/components/agent-persona-onboarding-wizard";
import { OnboardingComposerProgress } from "@/components/onboarding-composer-progress";
import { emitLocalSettingsSavedFromJson } from "@/lib/settings-sync-client";
import { serializeProfileForApi } from "@/lib/user-settings";
import { InterestPicksControl } from "@/components/interest-picks-control";
import { PrefecturePickWithChips } from "@/components/prefecture-pick-with-chips";
import { prefetchSchoolSearchCandidates, SchoolSearchFields } from "@/components/school-search-fields";
import { TimetableEditor } from "@/components/timetable-editor";
import { ageYearsFromYmd } from "@/lib/age-from-ymd";
import { LOVE_MBTI_16, LOVE_MBTI_TEST_URL_JA, isLoveMbtiType, loveMbtiDisplayJa } from "@/lib/love-mbti";
import {
  ONBOARDING_ASSISTANT_AFTER_BIRTH,
  ONBOARDING_ASSISTANT_AFTER_BLOOD,
  ONBOARDING_ASSISTANT_AFTER_GENDER,
  ONBOARDING_ASSISTANT_AFTER_INTERESTS,
  ONBOARDING_ASSISTANT_AFTER_LOVE,
  ONBOARDING_ASSISTANT_AFTER_MBTI_FOR_LOVE,
  ONBOARDING_ASSISTANT_AFTER_NICKNAME,
  ONBOARDING_ASSISTANT_AFTER_WORK_LIFE,
  ONBOARDING_ASSISTANT_CONFIRM_SAVE,
  ONBOARDING_ASSISTANT_WELCOME,
  ONBOARDING_GENDER_OPTIONS,
  ONBOARDING_UI,
  onboardingUserLog,
} from "@/lib/onboarding-chat-messages";
import {
  onboardingChatFlowKey,
  readSessionProfileDraft,
  type OnboardingChatFlowPersistV1,
} from "./onboarding-storage";
import {
  buildWorkLifeQuestionsAfterRole,
  composeWorkLifePayload,
  encodeMultiSelectStored,
  encodeParttimeIndustryStored,
  decodeSchoolWorkManual,
  decodeSchoolWorkPick,
  encodeSchoolWorkAnswer,
  formatWorkDetailUserLine,
  parseMultiSelectStored,
  parseParttimeIndustryStored,
  PREFECTURE_OPTIONS,
  prefectureOptionsForOriginRegion,
  type WorkLifeOption,
  type WorkLifeQuestion,
} from "@/lib/onboarding-work-life";
import { labelForOccupationRole, OCCUPATION_ROLE_OPTIONS } from "@/lib/occupation-role";
import { MBTI_16, MBTI_TEST_URL_JA, isMbtiType, mbtiDisplayJa } from "@/lib/mbti";
import { emptyTimetable, formatTimetableSummary, serializeTimetable } from "@/lib/timetable";
import { westernZodiacJaFromYmd } from "@/lib/zodiac-western";

/** ユーザーバブル「編集」で戻す先（職業・暮らしの分岐は detail まで戻す） */
export type OnboardingBubbleEditTarget = {
  step: number;
  workPhase?: "role" | "detail";
  workDetailIdx?: number;
  personaIdx?: number;
};

type Bubble = { role: "assistant" | "user"; content: string; edit?: OnboardingBubbleEditTarget };

function BubbleRow({
  role,
  children,
  edit,
  onEdit,
}: {
  role: "assistant" | "user";
  children: ReactNode;
  edit?: OnboardingBubbleEditTarget;
  onEdit?: () => void;
}) {
  const isUser = role === "user";
  const bubble = (
    <div
      className={`max-w-[min(100%,24rem)] rounded-2xl px-3 py-2 text-sm ${
        isUser
          ? "rounded-br-md bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
          : "rounded-bl-md border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
      }`}
    >
      {children}
    </div>
  );
  if (isUser && edit && onEdit) {
    return (
      <div className="flex justify-end gap-1.5">
        {bubble}
        <button
          type="button"
          onClick={onEdit}
          className="mb-0.5 shrink-0 self-end rounded-md border border-zinc-400/80 bg-white px-2 py-1 text-[10px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          編集
        </button>
      </div>
    );
  }
  return <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>{bubble}</div>;
}

const BLOOD = ["", "A", "B", "O", "AB", "不明"] as const;

function digitsOnly(s: string, maxLen: number) {
  return s.replace(/\D/g, "").slice(0, maxLen);
}

function ymdFromParts(yStr: string, mStr: string, dStr: string): string {
  if (!/^\d{4}$/.test(yStr)) return "";
  const mi = Number.parseInt(mStr, 10);
  const di = Number.parseInt(dStr, 10);
  if (!Number.isFinite(mi) || !Number.isFinite(di)) return "";
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return "";
  const mm = String(mi).padStart(2, "0");
  const dd = String(di).padStart(2, "0");
  const y = Number.parseInt(yStr, 10);
  const dt = new Date(y, mi - 1, di);
  if (dt.getFullYear() !== y || dt.getMonth() !== mi - 1 || dt.getDate() !== di) return "";
  return `${yStr}-${mm}-${dd}`;
}

function monthSegmentComplete(raw: string): boolean {
  if (raw.length === 0) return false;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return false;
  if (raw.length === 2) return n >= 1 && n <= 12;
  return raw.length === 1 && n >= 2 && n <= 9;
}

function BirthDateSplitFields({
  y,
  m,
  d,
  onYChange,
  onMChange,
  onDChange,
  inputCls,
}: {
  y: string;
  m: string;
  d: string;
  onYChange: (next: string) => void;
  onMChange: (next: string) => void;
  onDChange: (next: string) => void;
  inputCls: string;
}) {
  const yearRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  function focusSoon(el: HTMLInputElement | null) {
    if (!el) return;
    requestAnimationFrame(() => el.focus());
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex w-[6.25rem] shrink-0 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        年
        <input
          ref={yearRef}
          inputMode="numeric"
          autoComplete="bday-year"
          maxLength={4}
          placeholder="1990"
          value={y}
          onChange={(e) => {
            const next = digitsOnly(e.target.value, 4);
            onYChange(next);
            if (next.length === 4) focusSoon(monthRef.current);
          }}
          className={inputCls}
        />
      </label>
      <label className="flex w-[4.5rem] flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        月
        <input
          ref={monthRef}
          inputMode="numeric"
          autoComplete="bday-month"
          maxLength={2}
          placeholder="1–12"
          value={m}
          onChange={(e) => {
            const next = digitsOnly(e.target.value, 2);
            onMChange(next);
            if (monthSegmentComplete(next)) focusSoon(dayRef.current);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && m.length === 0) focusSoon(yearRef.current);
          }}
          className={inputCls}
        />
      </label>
      <label className="flex w-[4.5rem] flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        日
        <input
          ref={dayRef}
          inputMode="numeric"
          autoComplete="bday-day"
          maxLength={2}
          placeholder="1–31"
          value={d}
          onChange={(e) => onDChange(digitsOnly(e.target.value, 2))}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && d.length === 0) focusSoon(monthRef.current);
          }}
          className={inputCls}
        />
      </label>
    </div>
  );
}

function parseChatFlowPersist(raw: string): OnboardingChatFlowPersistV1 | null {
  try {
    const p = JSON.parse(raw) as OnboardingChatFlowPersistV1;
    if (p.v !== 1 || !Array.isArray(p.log)) return null;
    if (p.workPhase !== "role" && p.workPhase !== "detail") return null;
    return p;
  } catch {
    return null;
  }
}

export function OnboardingChatFlow({
  userId,
  draft,
  onDraftChange,
  onDone,
  onOpenFormMode,
  completeButtonLabel = "保存して今日へ",
}: {
  userId: string;
  draft: UserProfilePayload;
  onDraftChange: (patch: Partial<UserProfilePayload>) => void;
  onDone: () => void;
  onOpenFormMode?: () => void;
  /** 最終保存ボタンの文言（設定画面のオーバーレイなどで差し替え） */
  completeButtonLabel?: string;
}) {
  const [step, setStep] = useState(0);
  const [log, setLog] = useState<Bubble[]>([{ role: "assistant", content: ONBOARDING_ASSISTANT_WELCOME }]);

  const [birthY, setBirthY] = useState("");
  const [birthM, setBirthM] = useState("");
  const [birthD, setBirthD] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);

  /** ステップ3「暮らし・職業」: 立場確定後に分岐する1問ずつの選択 */
  const [workPhase, setWorkPhase] = useState<"role" | "detail">("role");
  const [workQueue, setWorkQueue] = useState<WorkLifeQuestion[]>([]);
  const [workDetailIdx, setWorkDetailIdx] = useState(0);
  const [workAnswers, setWorkAnswers] = useState<Record<string, string>>({});
  const [workDetailPick, setWorkDetailPick] = useState("");
  const [workMultiPick, setWorkMultiPick] = useState<string[]>([]);
  const [workPtIndustryFree, setWorkPtIndustryFree] = useState("");
  const [schoolSel, setSchoolSel] = useState<{
    id: string;
    name: string;
    prefecture: string;
    city: string;
    kind?: string;
  } | null>(null);
  const [schoolManual, setSchoolManual] = useState("");
  const [workTextPick, setWorkTextPick] = useState("");
  const [timetablePick, setTimetablePick] = useState("");
  /** 時間割はボトムシートで入力し、チャット欄の高さを確保する */
  const [timetableSheetOpen, setTimetableSheetOpen] = useState(false);
  const workLifeSyncKey = useRef("");
  /** ステップ8: AgentPersonaOnboardingWizard の画面位置（親と進捗バーで共有） */
  const [personaWizardIdx, setPersonaWizardIdx] = useState(0);
  const stepBeforeRef = useRef(step);
  const chatRestoreDoneRef = useRef(false);
  const chatPersistRef = useRef<{
    userId: string;
    step: number;
    personaWizardIdx: number;
    workPhase: "role" | "detail";
    workDetailIdx: number;
    occupationRoleSnap: string;
    log: Bubble[];
  }>({
    userId,
    step: 0,
    personaWizardIdx: 0,
    workPhase: "role",
    workDetailIdx: 0,
    occupationRoleSnap: "",
    log: [{ role: "assistant", content: ONBOARDING_ASSISTANT_WELCOME }],
  });

  useLayoutEffect(() => {
    chatRestoreDoneRef.current = false;
  }, [userId]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (chatRestoreDoneRef.current) return;

    const profile = readSessionProfileDraft(userId);
    const raw = sessionStorage.getItem(onboardingChatFlowKey(userId));
    if (!raw) {
      chatRestoreDoneRef.current = true;
      return;
    }
    if (!profile) {
      try {
        sessionStorage.removeItem(onboardingChatFlowKey(userId));
      } catch {
        /* ignore */
      }
      chatRestoreDoneRef.current = true;
      return;
    }

    const p = parseChatFlowPersist(raw);
    const roleSnap = profile.occupationRole ?? "";
    if (!p || p.occupationRoleSnap !== roleSnap) {
      try {
        sessionStorage.removeItem(onboardingChatFlowKey(userId));
      } catch {
        /* ignore */
      }
      chatRestoreDoneRef.current = true;
      return;
    }

    const stepClamped = Math.max(0, Math.min(9, Math.floor(p.step)));
    const personaClamped = Math.max(0, Math.min(10, Math.floor(p.personaWizardIdx)));
    const queue = buildWorkLifeQuestionsAfterRole(roleSnap);

    let wp = p.workPhase;
    let wdi = Math.max(0, p.workDetailIdx);
    if (stepClamped === 4) {
      if (wp === "detail") {
        if (queue.length === 0) {
          wp = "role";
          wdi = 0;
        } else {
          wdi = Math.min(wdi, queue.length - 1);
        }
        setWorkQueue(queue);
      } else {
        setWorkQueue([]);
        wdi = 0;
      }
    } else {
      setWorkQueue([]);
    }

    setStep(stepClamped);
    setLog(p.log as Bubble[]);
    setPersonaWizardIdx(personaClamped);
    setWorkPhase(wp);
    setWorkDetailIdx(wdi);
    setWorkAnswers({ ...(profile.onboardingWorkLifeAnswers ?? {}) });

    chatRestoreDoneRef.current = true;
  }, [userId]);

  useEffect(() => {
    const bd = draft.birthDate;
    if (bd && /^\d{4}-\d{2}-\d{2}$/.test(bd)) {
      const [y, mo, d] = bd.split("-");
      setBirthY(y);
      setBirthM(String(Number(mo)));
      setBirthD(String(Number(d)));
    } else if (!bd) {
      setBirthY("");
      setBirthM("");
      setBirthD("");
    }
  }, [draft.birthDate]);

  const birthDate = useMemo(() => ymdFromParts(birthY, birthM, birthD), [birthY, birthM, birthD]);
  const zodiac = useMemo(() => (birthDate ? westernZodiacJaFromYmd(birthDate) : null), [birthDate]);
  const age = useMemo(() => (birthDate ? ageYearsFromYmd(birthDate) : null), [birthDate]);

  useLayoutEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log]);

  useEffect(() => {
    if (stepBeforeRef.current === 7 && step === 8) {
      setPersonaWizardIdx(0);
    }
    stepBeforeRef.current = step;
  }, [step]);

  const workQ = step === 4 && workPhase === "detail" ? workQueue[workDetailIdx] : undefined;

  const timetableSummaryPreview = useMemo(() => formatTimetableSummary(timetablePick), [timetablePick]);

  useEffect(() => {
    if (workQ?.inputKind !== "timetable") setTimetableSheetOpen(false);
  }, [workQ?.inputKind, workDetailIdx]);

  useEffect(() => {
    if (!timetableSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [timetableSheetOpen]);

  useEffect(() => {
    if (!workQ) return;
    if (workQ.id === "st_school") {
      const enc = workAnswers.st_school ?? "";
      const pick = decodeSchoolWorkPick(enc);
      const man = decodeSchoolWorkManual(enc);
      setSchoolSel(pick);
      setSchoolManual(man);
      setWorkMultiPick([]);
      setWorkPtIndustryFree("");
    } else if (workQ.inputKind === "short_text") {
      setWorkTextPick("");
      setWorkMultiPick([]);
      setWorkPtIndustryFree("");
    } else if (workQ.inputKind === "timetable") {
      const existing = workAnswers[workQ.id];
      setTimetablePick(existing?.trim() ? existing : serializeTimetable(emptyTimetable()));
      setWorkMultiPick([]);
      setWorkPtIndustryFree("");
    } else if (workQ.inputKind === "multi_chips") {
      const p = parseParttimeIndustryStored(workAnswers[workQ.id] ?? "");
      setWorkMultiPick(p.tags);
      setWorkPtIndustryFree(p.free);
    } else if (workQ.inputKind === "multi_select") {
      if (workQ.id === "hi_pt_industry") {
        const p = parseParttimeIndustryStored(workAnswers[workQ.id] ?? "");
        setWorkMultiPick(p.tags);
        setWorkPtIndustryFree(p.free);
      } else {
        setWorkMultiPick(parseMultiSelectStored(workAnswers[workQ.id] ?? ""));
        setWorkPtIndustryFree("");
      }
    } else if (!workQ.inputKind || workQ.inputKind === "select") {
      if (workQ.id === "hi_origin_pref") {
        const opts = prefectureOptionsForOriginRegion(workAnswers.hi_origin ?? "");
        const allowed = new Set(opts.map((o) => o.value));
        const existing = (workAnswers.hi_origin_pref ?? "").trim();
        setWorkDetailPick(existing && allowed.has(existing) ? existing : "");
      } else if (workQ.id === "st_home_pref" || workQ.id === "hi_home_pref") {
        setWorkDetailPick((workAnswers[workQ.id] ?? "").trim());
      } else {
        setWorkDetailPick("");
      }
      setWorkMultiPick([]);
      setWorkPtIndustryFree("");
    }
  }, [workDetailIdx, workPhase, step, workQ?.id, workQ?.inputKind, workAnswers]);

  useEffect(() => {
    if (step !== 4 || workPhase !== "detail" || !workQ) return;
    const pending: Record<string, string> = { ...workAnswers };
    if (workQ.inputKind === "school") {
      pending[workQ.id] = encodeSchoolWorkAnswer(schoolSel, schoolManual);
    } else if (workQ.inputKind === "short_text") {
      pending[workQ.id] = workTextPick;
    } else if (workQ.inputKind === "timetable") {
      pending[workQ.id] = timetablePick;
    } else if (workQ.inputKind === "multi_chips") {
      pending[workQ.id] = encodeParttimeIndustryStored(workMultiPick, workPtIndustryFree);
    } else if (workQ.inputKind === "multi_select") {
      pending[workQ.id] =
        workQ.id === "hi_pt_industry"
          ? encodeParttimeIndustryStored(workMultiPick, workPtIndustryFree)
          : encodeMultiSelectStored(workMultiPick);
    } else {
      pending[workQ.id] = workDetailPick;
    }
    const sig = JSON.stringify(pending);
    if (sig === workLifeSyncKey.current) return;
    workLifeSyncKey.current = sig;
    onDraftChange({ onboardingWorkLifeAnswers: pending });
  }, [
    step,
    workPhase,
    workQ?.id,
    workQ?.inputKind,
    workAnswers,
    workDetailPick,
    workMultiPick,
    workPtIndustryFree,
    schoolSel,
    schoolManual,
    workTextPick,
    timetablePick,
    onDraftChange,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const c = chatPersistRef.current;
        const payload: OnboardingChatFlowPersistV1 = {
          v: 1,
          step: c.step,
          personaWizardIdx: c.personaWizardIdx,
          workPhase: c.workPhase,
          workDetailIdx: c.workDetailIdx,
          occupationRoleSnap: c.occupationRoleSnap,
          log: c.log,
        };
        sessionStorage.setItem(onboardingChatFlowKey(c.userId), JSON.stringify(payload));
      } catch {
        /* quota */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [userId, step, personaWizardIdx, workPhase, workDetailIdx, draft.occupationRole, log]);

  useEffect(() => {
    function flush() {
      try {
        const c = chatPersistRef.current;
        const payload: OnboardingChatFlowPersistV1 = {
          v: 1,
          step: c.step,
          personaWizardIdx: c.personaWizardIdx,
          workPhase: c.workPhase,
          workDetailIdx: c.workDetailIdx,
          occupationRoleSnap: c.occupationRoleSnap,
          log: c.log,
        };
        sessionStorage.setItem(onboardingChatFlowKey(c.userId), JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [userId]);

  function pushUser(text: string, edit?: OnboardingBubbleEditTarget) {
    setLog((L) => [...L, { role: "user", content: text, edit }]);
  }

  function pushAssistant(text: string) {
    setLog((L) => [...L, { role: "assistant", content: text }]);
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      const zOut = draft.birthDate ? (westernZodiacJaFromYmd(draft.birthDate) ?? draft.zodiac ?? "") : "";
      const profile = serializeProfileForApi(draft);
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: { ...profile, zodiac: zOut },
          ...(!draft.onboardingCompletedAt ? { finalizeOnboarding: true } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "保存に失敗しました");
        return;
      }
      emitLocalSettingsSavedFromJson(json);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  function nextFromNickname() {
    const t = (draft.nickname ?? "").trim();
    pushUser(onboardingUserLog.nickname(t), { step: 0 });
    pushAssistant(ONBOARDING_ASSISTANT_AFTER_NICKNAME);
    setStep(1);
  }

  function nextFromBirth() {
    const bd = birthDate || "";
    const zo = bd ? (westernZodiacJaFromYmd(bd) ?? "") : "";
    onDraftChange({ birthDate: bd, zodiac: zo });
    const ag = bd ? ageYearsFromYmd(bd) : null;
    const zLabel = bd ? westernZodiacJaFromYmd(bd) : null;
    pushUser(onboardingUserLog.birth(bd, zLabel, ag), { step: 1 });
    pushAssistant(ONBOARDING_ASSISTANT_AFTER_BIRTH);
    setStep(2);
  }

  function resetWorkLifeState() {
    setWorkPhase("role");
    setWorkQueue([]);
    setWorkDetailIdx(0);
    setWorkAnswers({});
    setWorkDetailPick("");
    setWorkMultiPick([]);
    setWorkPtIndustryFree("");
    workLifeSyncKey.current = "";
  }

  function applyEdit(target: OnboardingBubbleEditTarget) {
    if (target.step === 4) {
      if (target.workPhase === "role") {
        resetWorkLifeState();
        setWorkPhase("role");
        setWorkQueue([]);
      } else if (target.workPhase === "detail") {
        const role = draft.occupationRole ?? "";
        const queue = buildWorkLifeQuestionsAfterRole(role);
        setWorkQueue(queue);
        setWorkAnswers({ ...(draft.onboardingWorkLifeAnswers ?? {}) });
        setWorkPhase("detail");
        setWorkDetailIdx(target.workDetailIdx ?? 0);
        workLifeSyncKey.current = "";
        setWorkTextPick("");
        setTimetablePick("");
        setTimetableSheetOpen(false);
      }
    }
    if (target.personaIdx != null) {
      setPersonaWizardIdx(target.personaIdx);
    }
    setStep(target.step);
  }

  function nextFromGender() {
    pushUser(onboardingUserLog.gender(draft.gender ?? ""), { step: 2 });
    pushAssistant(ONBOARDING_ASSISTANT_AFTER_GENDER);
    setStep(3);
  }

  /** 性別の次：血液型 → 職業・暮らしへ */
  function nextFromBloodAfterGender() {
    pushUser(onboardingUserLog.blood(draft.bloodType ?? ""), { step: 3 });
    pushAssistant(ONBOARDING_ASSISTANT_AFTER_BLOOD);
    resetWorkLifeState();
    setStep(4);
  }

  function finishWorkLifeSection(role: string, answers: Record<string, string>) {
    const composed = composeWorkLifePayload(role, answers);
    onDraftChange({
      occupationRole: role,
      occupationNote: composed.occupationNote,
      studentLifeNotes: composed.studentLifeNotes,
      education: composed.education,
      onboardingWorkLifeAnswers: answers,
    });
    pushUser(onboardingUserLog.workLifeFromComposed(role, composed), { step: 4, workPhase: "role" });
    pushAssistant(ONBOARDING_ASSISTANT_AFTER_WORK_LIFE);
    resetWorkLifeState();
    setStep(5);
  }

  function nextFromWorkRole() {
    const role = draft.occupationRole ?? "";
    pushUser(role ? `立場: ${labelForOccupationRole(role)}` : "立場: （選ばない）", { step: 4, workPhase: "role" });
    onDraftChange({ occupationRole: role });
    const queue = buildWorkLifeQuestionsAfterRole(role);
    workLifeSyncKey.current = "";
    setWorkQueue(queue);
    setWorkPhase("detail");
    setWorkDetailIdx(0);
    setWorkAnswers({});
    setWorkDetailPick("");
    setWorkMultiPick([]);
    setWorkPtIndustryFree("");
    pushAssistant(queue[0].assistant);
  }

  function nextFromWorkDetail() {
    const q = workQueue[workDetailIdx];
    if (!q) return;
    let stored = "";
    if (q.inputKind === "multi_chips") {
      stored = encodeParttimeIndustryStored(workMultiPick, workPtIndustryFree);
    } else if (q.inputKind === "multi_select") {
      stored =
        q.id === "hi_pt_industry"
          ? encodeParttimeIndustryStored(workMultiPick, workPtIndustryFree)
          : encodeMultiSelectStored(workMultiPick);
    } else if (!q.inputKind || q.inputKind === "select") {
      stored = workDetailPick;
    } else if (q.inputKind === "school") {
      stored = encodeSchoolWorkAnswer(schoolSel, schoolManual);
    } else if (q.inputKind === "short_text") {
      stored = workTextPick.trim();
    } else if (q.inputKind === "timetable") {
      stored = timetablePick.trim();
    }
    pushUser(formatWorkDetailUserLine(q, stored), {
      step: 4,
      workPhase: "detail",
      workDetailIdx,
    });
    const merged = { ...workAnswers, [q.id]: stored };
    setWorkAnswers(merged);
    const nextIdx = workDetailIdx + 1;
    if (nextIdx >= workQueue.length) {
      finishWorkLifeSection(draft.occupationRole ?? "", merged);
      return;
    }
    if (q.id === "st_level" && workQueue[nextIdx]?.inputKind === "school") {
      prefetchSchoolSearchCandidates(merged.st_level ?? "");
    }
    setWorkDetailIdx(nextIdx);
    setWorkDetailPick("");
    setWorkMultiPick([]);
    setWorkPtIndustryFree("");
    setWorkTextPick("");
    setTimetablePick("");
    pushAssistant(workQueue[nextIdx].assistant);
  }

  function nextFromMbti() {
    const mbti = draft.mbti ?? "";
    pushUser(mbti ? `MBTI: ${isMbtiType(mbti) ? mbtiDisplayJa(mbti) : mbti}` : "（スキップ）", { step: 5 });
    pushAssistant(ONBOARDING_ASSISTANT_AFTER_MBTI_FOR_LOVE);
    setStep(6);
  }

  function nextFromLoveMbti() {
    const loveMbti = draft.loveMbti ?? "";
    pushUser(
      loveMbti
        ? `恋愛MBTI: ${isLoveMbtiType(loveMbti) ? loveMbtiDisplayJa(loveMbti) : loveMbti}`
        : "（スキップ）",
      { step: 6 },
    );
    pushAssistant(ONBOARDING_ASSISTANT_AFTER_LOVE);
    setStep(7);
  }

  function nextFromInterests() {
    const picks = draft.interestPicks ?? [];
    pushUser(onboardingUserLog.interests(picks), { step: 7 });
    pushAssistant(ONBOARDING_ASSISTANT_AFTER_INTERESTS);
    setStep(8);
  }

  function nextFromAgentPersonaAndMemo() {
    pushUser(onboardingUserLog.agentPersonaAndMemo(draft.preferences ?? ""), { step: 8, personaIdx: 10 });
    pushAssistant(ONBOARDING_ASSISTANT_CONFIRM_SAVE);
    setStep(9);
  }

  chatPersistRef.current = {
    userId,
    step,
    personaWizardIdx,
    workPhase,
    workDetailIdx,
    occupationRoleSnap: draft.occupationRole ?? "",
    log,
  };

  /** ログを可能な限り広げ、入力部は内容量に応じ可変（長いときだけ max で内側スクロール） */
  const composerShell =
    "min-w-0 flex w-full max-w-full min-h-0 shrink-0 flex-col overflow-hidden bg-white/90 pt-1 backdrop-blur-md dark:bg-zinc-950/90 max-h-[min(52dvh,520px)]";

  const primaryBtnCls =
    "mx-auto block w-full max-w-[220px] rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700";

  const primaryBtnNextRowCls =
    "shrink-0 whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col pt-4">
      <div
        ref={logScrollRef}
        className="mb-2 min-h-0 min-w-0 flex-1 basis-0 space-y-3 overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        {log.map((b, i) => (
          <BubbleRow
            key={i}
            role={b.role}
            edit={b.edit}
            onEdit={b.role === "user" && b.edit ? () => applyEdit(b.edit!) : undefined}
          >
            <p className="whitespace-pre-wrap leading-relaxed">{b.content}</p>
          </BubbleRow>
        ))}
      </div>

      <div
        className={`${composerShell} pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]">
          <div className="mt-auto w-full min-w-0 space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {step === 0 && (
          <div className="min-w-0 space-y-2">
            <input
              value={draft.nickname ?? ""}
              onChange={(e) => onDraftChange({ nickname: e.target.value })}
              placeholder={ONBOARDING_UI.nicknamePlaceholder}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button type="button" onClick={() => nextFromNickname()} className={primaryBtnCls}>
              次へ
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="min-w-0 space-y-2">
            <BirthDateSplitFields
              y={birthY}
              m={birthM}
              d={birthD}
              onYChange={setBirthY}
              onMChange={setBirthM}
              onDChange={setBirthD}
              inputCls="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
            />
            {zodiac && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {ONBOARDING_UI.zodiacPrefix}{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{zodiac}</span>
                {ONBOARDING_UI.zodiacSuffixAuto}
              </p>
            )}
            {age != null && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {ONBOARDING_UI.agePrefix}{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{age}</span>
                {ONBOARDING_UI.ageSuffixAuto}
              </p>
            )}
            <button type="button" onClick={() => nextFromBirth()} className={primaryBtnCls}>
              次へ
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="min-w-0 space-y-2">
            <select
              value={draft.gender ?? ""}
              onChange={(e) => onDraftChange({ gender: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {ONBOARDING_GENDER_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => nextFromGender()} className={primaryBtnCls}>
              次へ
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="min-w-0 space-y-2">
            <select
              value={draft.bloodType ?? ""}
              onChange={(e) => onDraftChange({ bloodType: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {BLOOD.map((b) => (
                <option key={b || "empty"} value={b}>
                  {b || "選ばない"}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => nextFromBloodAfterGender()} className={primaryBtnCls}>
              次へ
            </button>
          </div>
        )}

        {step === 4 && workPhase === "role" && (
          <div className="min-w-0 space-y-2">
            <select
              value={draft.occupationRole ?? ""}
              onChange={(e) => onDraftChange({ occupationRole: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {OCCUPATION_ROLE_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => nextFromWorkRole()} className={primaryBtnCls}>
              次へ
            </button>
          </div>
        )}

        {step === 4 && workPhase === "detail" && workQ && (
          <div className="min-w-0 space-y-2">
            {workQ.inputKind === "school" && (
              <SchoolSearchFields
                key={workDetailIdx}
                compact
                stLevel={workAnswers.st_level ?? ""}
                selected={schoolSel}
                manual={schoolManual}
                onSelectedChange={(hit) => {
                  setSchoolSel(hit);
                  if (hit) setSchoolManual("");
                }}
                onManualChange={setSchoolManual}
              />
            )}

            {workQ.inputKind === "timetable" && (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  時間割は下のボタンから入力します。入力画面は下からスライドして開き、チャットは上のエリアに残ります。
                </p>
                {timetableSummaryPreview ? (
                  <p className="line-clamp-3 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200">
                    {timetableSummaryPreview}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">まだ入力されていません（任意）</p>
                )}
                <div className="flex min-w-0 flex-row items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => setTimetableSheetOpen(true)}
                    className="min-w-0 flex-1 rounded-xl border border-emerald-600 bg-emerald-50 py-2.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
                  >
                    時間割を入力・編集
                  </button>
                  <button
                    type="button"
                    onClick={() => nextFromWorkDetail()}
                    className={primaryBtnNextRowCls}
                  >
                    次へ
                  </button>
                </div>
                {timetableSheetOpen && typeof document !== "undefined"
                  ? createPortal(
                      <div
                        className="fixed inset-0 z-[200] flex flex-col items-center justify-end"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="onboarding-timetable-sheet-title"
                      >
                        <button
                          type="button"
                          className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
                          aria-label="閉じる"
                          onClick={() => setTimetableSheetOpen(false)}
                        />
                        <div className="relative z-10 w-full min-w-0 max-w-lg px-4">
                          <div className="flex max-h-[90dvh] min-h-0 flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                              <p
                                id="onboarding-timetable-sheet-title"
                                className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                              >
                                時間割
                              </p>
                              <button
                                type="button"
                                className="rounded-lg px-2 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                                onClick={() => setTimetableSheetOpen(false)}
                              >
                                閉じる
                              </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
                              <TimetableEditor
                                key={workDetailIdx}
                                compact
                                value={timetablePick}
                                onChange={setTimetablePick}
                                stLevel={workAnswers.st_level ?? ""}
                              />
                            </div>
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            )}

            {workQ.inputKind === "short_text" && (
              <textarea
                value={workTextPick}
                onChange={(e) => setWorkTextPick(e.target.value)}
                rows={3}
                placeholder={workQ.shortTextPlaceholder ?? "任意"}
                className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            )}

            {workQ.inputKind === "multi_chips" && workQ.options && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  タップで複数選べます（趣味嗜好と同じイメージ）。選ばなくても次へ進めます。
                </p>
                <div className="max-h-[min(34vh,200px)] overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
                  <div className="flex flex-wrap gap-1.5">
                    {workQ.options.map((o: WorkLifeOption) => {
                      const on = workMultiPick.includes(o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => {
                            if (o.value === "other" && workMultiPick.includes("other")) {
                              setWorkPtIndustryFree("");
                            }
                            setWorkMultiPick((prev) =>
                              prev.includes(o.value) ? prev.filter((x) => x !== o.value) : [...prev, o.value],
                            );
                          }}
                          className={`rounded-lg border px-2 py-0.5 text-left text-[11px] font-medium leading-tight transition ${
                            on
                              ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  {workQ.id === "hi_pt_industry" && workMultiPick.includes("other") ? (
                    <label className="mt-3 block text-xs text-zinc-600 dark:text-zinc-400">
                      店名・具体的な仕事（任意）
                      <input
                        type="text"
                        value={workPtIndustryFree}
                        onChange={(e) => setWorkPtIndustryFree(e.target.value)}
                        placeholder="例：〇〇ドラッグのレジ、映画館の売店 など"
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            )}

            {workQ.inputKind === "multi_select" && workQ.options && (
              <div className="space-y-2">
                <div className="max-h-[min(34vh,200px)] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    該当するものをすべて選べます。「その他」にチェックを入れると、枠内の下に詳細を書けます。
                  </p>
                  {workQ.options.map((o: WorkLifeOption) => (
                    <label
                      key={o.value}
                      className="flex cursor-pointer items-start gap-2 rounded-lg py-1 text-sm text-zinc-800 dark:text-zinc-100"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0 rounded border-zinc-300 dark:border-zinc-600"
                        checked={workMultiPick.includes(o.value)}
                        onChange={(e) => {
                          if (!e.target.checked && o.value === "other") {
                            setWorkPtIndustryFree("");
                          }
                          setWorkMultiPick((prev) =>
                            e.target.checked ? [...prev, o.value] : prev.filter((x) => x !== o.value),
                          );
                        }}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                  {workQ.id === "hi_pt_industry" && workMultiPick.includes("other") ? (
                    <label className="block border-t border-zinc-100 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                      店名・職種の詳細（任意）
                      <input
                        type="text"
                        value={workPtIndustryFree}
                        onChange={(e) => setWorkPtIndustryFree(e.target.value)}
                        placeholder="例：〇〇ドラッグのレジ、映画館の売店、家電量販のイベントスタッフ など"
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            )}

            {(!workQ.inputKind || workQ.inputKind === "select") && workQ.options && (
              <div className="space-y-2">
                {workQ.id === "st_home_pref" ||
                workQ.id === "hi_origin_pref" ||
                workQ.id === "hi_home_pref" ? (
                  <PrefecturePickWithChips
                    questionId={workQ.id}
                    workAnswers={workAnswers}
                    value={workDetailPick}
                    onChange={setWorkDetailPick}
                    selectOptions={
                      workQ.id === "hi_origin_pref"
                        ? prefectureOptionsForOriginRegion(workAnswers.hi_origin ?? "")
                        : PREFECTURE_OPTIONS
                    }
                    inputCls="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                ) : (
                  <select
                    value={workDetailPick}
                    onChange={(e) => setWorkDetailPick(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {workQ.options.map((o: WorkLifeOption) => (
                      <option key={o.value || "empty"} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {workQ.inputKind !== "timetable" && (
              <button
                type="button"
                onClick={() => nextFromWorkDetail()}
                className={`${primaryBtnCls} shrink-0`}
              >
                次へ
              </button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="min-w-0 space-y-2">
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {ONBOARDING_UI.mbtiHintBeforeLink}
              <a
                href={MBTI_TEST_URL_JA}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {ONBOARDING_UI.mbtiHintLinkLabel}
              </a>
              {ONBOARDING_UI.mbtiHintAfterLink}
            </p>
            <select
              value={draft.mbti ?? ""}
              onChange={(e) => onDraftChange({ mbti: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">選ばない</option>
              {MBTI_16.map((m) => (
                <option key={m} value={m}>
                  {mbtiDisplayJa(m)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => nextFromMbti()} className={primaryBtnCls}>
              次へ
            </button>
          </div>
        )}

        {step === 6 && (
          <div className="min-w-0 space-y-2">
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {ONBOARDING_UI.mbtiHintBeforeLink}
              <a
                href={LOVE_MBTI_TEST_URL_JA}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {ONBOARDING_UI.loveHintLinkLabel}
              </a>
              {ONBOARDING_UI.mbtiHintAfterLink}
            </p>
            <select
              value={draft.loveMbti ?? ""}
              onChange={(e) => onDraftChange({ loveMbti: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">選ばない</option>
              {LOVE_MBTI_16.map((code) => (
                <option key={code} value={code}>
                  {loveMbtiDisplayJa(code)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => nextFromLoveMbti()} className={primaryBtnCls}>
              次へ
            </button>
          </div>
        )}

        {step === 7 && (
          <div className="min-w-0 space-y-3">
            <InterestPicksControl
              value={draft.interestPicks ?? []}
              onChange={(next) => onDraftChange({ interestPicks: next })}
            />
            <button type="button" onClick={() => nextFromInterests()} className={primaryBtnCls}>
              次へ
            </button>
          </div>
        )}

        {step === 8 && (
          <div className="min-h-0 w-full max-h-[min(58vh,480px)] overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]">
            <AgentPersonaOnboardingWizard
              form={draft}
              patchForm={(next) => onDraftChange(next)}
              stepIndex={personaWizardIdx}
              onStepIndexChange={setPersonaWizardIdx}
              onComplete={() => nextFromAgentPersonaAndMemo()}
            />
          </div>
        )}

        {step === 9 && (
          <div className="flex w-full min-w-0 flex-col items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAll()}
              className={`${primaryBtnCls} disabled:opacity-50`}
            >
              {saving ? "保存中…" : completeButtonLabel}
            </button>
            {onOpenFormMode && (
              <div className="w-full text-left">
                <button
                  type="button"
                  onClick={onOpenFormMode}
                  className="text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  フォームで直す
                </button>
              </div>
            )}
          </div>
        )}

        {step < 9 && onOpenFormMode && (
          <p className="min-w-0 max-w-full pt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <button type="button" onClick={onOpenFormMode} className="underline">
              {ONBOARDING_UI.openFormLink}（入力内容は引き継がれます）
            </button>
          </p>
        )}
          </div>
        </div>

        <div className="shrink-0">
          <OnboardingComposerProgress
            mainStep={step}
            personaSubStep={step === 8 ? personaWizardIdx : undefined}
          />
        </div>
      </div>
    </div>
  );
}
