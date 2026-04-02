import type { Prisma } from "@/generated/prisma/client";
import { formatInterestPicksForPrompt } from "@/lib/interest-taxonomy";

export type DefaultWeatherLocation = {
  latitude: number;
  longitude: number;
  label?: string;
};

/** プロフィール（settings JSON の profile に保存。任意項目のみ） */
export type UserProfileSettings = {
  /** 表示用ニックネーム（OAuth の name とは別） */
  nickname?: string;
  /** YYYY-MM-DD */
  birthDate?: string;
  /** 星座（生年月日から自動。手編集は上書きされうる） */
  zodiac?: string;
  /** A / B / O / AB / 不明 など */
  bloodType?: string;
  /** 学歴・職業など自由記述 */
  education?: string;
  /** 16タイプ英字 */
  mbti?: string;
  loveMbti?: string;
  /** 趣味（自由記述・補足） */
  hobbies?: string;
  /** 嗜好・関心（自由記述・補足） */
  interests?: string;
  /** 階層タグ `category:sub` の配列 */
  interestPicks?: string[];
  /** 好み・メモ */
  preferences?: string;
  /** 初回オンボーディング完了（スキップ含む） */
  onboardingCompletedAt?: string;
};

export type AppUserSettings = {
  defaultWeatherLocation?: DefaultWeatherLocation;
  profile?: UserProfileSettings;
};

function parseDefaultWeatherLocation(raw: unknown): DefaultWeatherLocation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const loc = raw as Record<string, unknown>;
  const lat = typeof loc.latitude === "number" ? loc.latitude : Number(loc.latitude);
  const lon = typeof loc.longitude === "number" ? loc.longitude : Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return undefined;
  }
  const label = typeof loc.label === "string" ? loc.label : undefined;
  return {
    latitude: lat,
    longitude: lon,
    ...(label ? { label } : {}),
  };
}

function parseInterestPicks(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length > 0 ? out : undefined;
}

function parseProfile(raw: unknown): UserProfileSettings | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? o[k] : undefined);
  const out: UserProfileSettings = {};
  const nickname = str("nickname");
  const birthDate = str("birthDate");
  const zodiac = str("zodiac");
  const bloodType = str("bloodType");
  const education = str("education");
  const mbti = str("mbti");
  const loveMbti = str("loveMbti");
  const hobbies = str("hobbies");
  const interests = str("interests");
  const preferences = str("preferences");
  const onboardingCompletedAt = str("onboardingCompletedAt");
  const interestPicks = parseInterestPicks(o.interestPicks);

  if (nickname) out.nickname = nickname;
  if (birthDate) out.birthDate = birthDate;
  if (zodiac) out.zodiac = zodiac;
  if (bloodType) out.bloodType = bloodType;
  if (education) out.education = education;
  if (mbti) out.mbti = mbti;
  if (loveMbti) out.loveMbti = loveMbti;
  if (hobbies) out.hobbies = hobbies;
  if (interests) out.interests = interests;
  if (preferences) out.preferences = preferences;
  if (onboardingCompletedAt) out.onboardingCompletedAt = onboardingCompletedAt;
  if (interestPicks) out.interestPicks = interestPicks;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseUserSettings(settings: Prisma.JsonValue): AppUserSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  const o = settings as Record<string, unknown>;
  const defaultWeatherLocation = parseDefaultWeatherLocation(o.defaultWeatherLocation);
  const profile = parseProfile(o.profile);
  const out: AppUserSettings = {};
  if (defaultWeatherLocation) out.defaultWeatherLocation = defaultWeatherLocation;
  if (profile) out.profile = profile;
  return out;
}

export type SettingsPatch = {
  defaultWeatherLocation?: DefaultWeatherLocation | null;
  profile?: Partial<UserProfileSettings> | null;
};

/** Prisma `settings` 更新用にマージ（既存キーは維持） */
export function mergeUserSettingsJson(
  current: Prisma.JsonValue,
  patch: SettingsPatch,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  if ("defaultWeatherLocation" in patch) {
    if (patch.defaultWeatherLocation == null) {
      delete base.defaultWeatherLocation;
    } else {
      base.defaultWeatherLocation = patch.defaultWeatherLocation;
    }
  }
  if ("profile" in patch) {
    if (patch.profile == null) {
      delete base.profile;
    } else {
      const prev =
        base.profile && typeof base.profile === "object" && !Array.isArray(base.profile)
          ? (base.profile as Record<string, unknown>)
          : {};
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch.profile)) {
        if (v === undefined) continue;
        if (v === null || v === "") {
          delete next[k];
          continue;
        }
        if (Array.isArray(v)) {
          if (v.length === 0) {
            delete next[k];
          } else {
            next[k] = v;
          }
          continue;
        }
        next[k] = v;
      }
      base.profile = next;
    }
  }
  return base as Prisma.InputJsonValue;
}

/** チャット文脈用: 空でない項目だけをテキスト化 */
export function formatUserProfileForPrompt(profile: UserProfileSettings | undefined): string {
  if (!profile) return "（未登録）";
  const lines: string[] = [];
  if (profile.nickname) lines.push(`- ニックネーム: ${profile.nickname}`);
  if (profile.birthDate) lines.push(`- 生年月日: ${profile.birthDate}`);
  if (profile.zodiac) lines.push(`- 星座: ${profile.zodiac}`);
  if (profile.bloodType) lines.push(`- 血液型: ${profile.bloodType}`);
  if (profile.education) lines.push(`- 学歴・職業など: ${profile.education}`);
  if (profile.mbti) lines.push(`- MBTI: ${profile.mbti}`);
  if (profile.loveMbti) lines.push(`- 恋愛MBTI（16タイプ）: ${profile.loveMbti}`);
  const pickBlock = formatInterestPicksForPrompt(profile.interestPicks);
  if (pickBlock) lines.push(`- 関心タグ（選択）:\n${pickBlock}`);
  if (profile.hobbies) lines.push(`- 趣味（自由記述）: ${profile.hobbies}`);
  if (profile.interests) lines.push(`- 嗜好・関心（自由記述）: ${profile.interests}`);
  if (profile.preferences) lines.push(`- 好み・メモ: ${profile.preferences}`);
  return lines.length > 0 ? lines.join("\n") : "（未登録）";
}
