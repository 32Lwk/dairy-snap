import type { UserProfilePayload } from "@/components/user-profile-form";

export function onboardingProfileDraftKey(userId: string) {
  return `onboarding-profile-draft:${userId}`;
}

export function onboardingModeKey(userId: string) {
  return `onboarding-mode:${userId}`;
}

export function onboardingChatFlowKey(userId: string) {
  return `onboarding-chat-flow:${userId}`;
}

/** チャットオンボの UI 状態（プロフィール下書きとは別キーで保存） */
export type OnboardingChatFlowPersistV1 = {
  v: 1;
  step: number;
  personaWizardIdx: number;
  workPhase: "role" | "detail";
  workDetailIdx: number;
  occupationRoleSnap: string;
  log: {
    role: "assistant" | "user";
    content: string;
    edit?: {
      step: number;
      workPhase?: "role" | "detail";
      workDetailIdx?: number;
      personaIdx?: number;
    };
  }[];
};

export function clearOnboardingSessionStorage(userId: string) {
  try {
    sessionStorage.removeItem(onboardingProfileDraftKey(userId));
    sessionStorage.removeItem(onboardingModeKey(userId));
    sessionStorage.removeItem(onboardingChatFlowKey(userId));
  } catch {
    /* ignore */
  }
}

/** session に保存済みの profile 下書き。無い・壊れている場合は null */
export function readSessionProfileDraft(userId: string): Partial<UserProfilePayload> | null {
  try {
    const raw = sessionStorage.getItem(onboardingProfileDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Partial<UserProfilePayload>;
  } catch {
    return null;
  }
}
