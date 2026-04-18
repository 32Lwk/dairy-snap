import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { resolveDbUserFromSession } from "@/lib/api/resolve-db-user-from-session";
import { isLoveMbtiType } from "@/lib/love-mbti";
import { isMbtiType } from "@/lib/mbti";
import {
  mergeUserSettingsJson,
  parseUserSettings,
  type UserProfileSettings,
} from "@/lib/user-settings";
import { prisma } from "@/server/db";
import { PROMPT_VERSIONS } from "@/server/prompts";
import { LIMITS, getTodayCounter } from "@/server/usage";

/** Next.js／CDN が GET を静的キャッシュしないようにする */
export const dynamic = "force-dynamic";

/** Safari 等のクライアント／プロキシが JSON を誤キャッシュしないようにする（ユーザー別は Cookie 依存） */
const JSON_NO_CACHE = {
  headers: {
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Vary: "Cookie",
  },
} as const;

const mbtiField = z
  .string()
  .max(8)
  .refine((s) => s === "" || isMbtiType(s), { message: "MBTI は16タイプの英字4文字" });

const loveMbtiField = z
  .string()
  .max(8)
  .refine((s) => s === "" || isLoveMbtiType(s), {
    message: "恋愛MBTI は16タイプの英字4文字（LCRO など）",
  });

const profilePatchSchema = z
  .object({
    nickname: z.string().max(80).optional(),
    birthDate: z.string().max(32).optional(),
    zodiac: z.string().max(120).optional(),
    bloodType: z.string().max(32).optional(),
    gender: z.string().max(32).optional(),
    occupationRole: z.string().max(32).optional(),
    occupationNote: z.string().max(500).optional(),
    studentLifeNotes: z.string().max(2000).optional(),
    education: z.string().max(2000).optional(),
    mbti: mbtiField.optional(),
    loveMbti: loveMbtiField.optional(),
    hobbies: z.string().max(2000).optional(),
    interests: z.string().max(2000).optional(),
    interestPicks: z.array(z.string().max(120)).max(80).optional(),
    preferences: z.string().max(4000).optional(),
    onboardingCompletedAt: z.string().max(64).optional(),
    aiAddressStyle: z.string().max(32).optional(),
    aiChatTone: z.string().max(32).optional(),
    aiDepthLevel: z.string().max(32).optional(),
    aiEnergyPeak: z.string().max(32).optional(),
    aiBusyWindows: z.array(z.string().max(80)).max(32).optional(),
    aiAvoidTopics: z.array(z.string().max(80)).max(32).optional(),
    aiCurrentFocus: z.array(z.string().max(80)).max(32).optional(),
    aiHealthComfort: z.string().max(32).optional(),
    aiHousehold: z.string().max(32).optional(),
    aiMemoryRecallStyle: z.string().max(32).optional(),
    aiMemoryNamePolicy: z.string().max(32).optional(),
    aiMemoryForgetBias: z.string().max(32).optional(),
    /** 時間割エディタの完全データ（TT_JSON_V1 形式） */
    studentTimetable: z.string().max(120_000).optional(),
    /** 職業・暮らしウィザード回答（st_timetable_note は含めない想定） */
    workLifeAnswers: z
      .record(z.string().max(64), z.string().max(12_000))
      .optional()
      .refine((o) => o == null || Object.keys(o).length <= 80, {
        message: "workLifeAnswers のキー数が多すぎます",
      }),
    /** 開口トピックの分類・優先順位 */
    calendarOpening: z
      .object({
        priorityOrder: z.array(z.string().max(48)).max(32).optional(),
        customCategoryLabels: z.array(z.string().min(1).max(24)).max(16).optional(),
        rules: z
          .array(
            z.object({
              kind: z.string().max(32),
              value: z.string().max(120),
              category: z.string().max(48),
              weight: z.number().min(-50).max(120).optional(),
            }),
          )
          .max(120)
          .optional(),
        gridDisplay: z
          .object({
            weekStartsOn: z.number().int().min(0).max(6).optional(),
            maxEventsPerCell: z.number().int().min(1).max(5).optional(),
            calendarHexById: z
              .record(z.string().max(400), z.string().regex(/^#[0-9A-Fa-f]{6}$/i))
              .optional()
              .refine((rec) => rec == null || Object.keys(rec).length <= 40, {
                message: "calendarHexById が多すぎます",
              }),
          })
          .optional(),
        calendarCategoryById: z
          .record(z.string().max(400), z.string().max(48))
          .optional()
          .refine((rec) => rec == null || Object.keys(rec).length <= 40, {
            message: "calendarCategoryById が多すぎます",
          }),
        calendarDisplayLabelById: z
          .record(z.string().max(400), z.string().min(1).max(80))
          .optional()
          .refine((rec) => rec == null || Object.keys(rec).length <= 40, {
            message: "calendarDisplayLabelById が多すぎます",
          }),
      })
      .optional(),
    /** AIの誤推測の訂正（短い箇条書き） */
    aiCorrections: z.array(z.string().max(200)).max(60).optional(),
  })
  .strict();

const patchSchema = z.object({
  encryptionMode: z.enum(["STANDARD", "EXPERIMENTAL_E2EE"]).optional(),
  defaultWeatherLocation: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      label: z.string().max(120).optional(),
    })
    .nullable()
    .optional(),
  profile: profilePatchSchema.optional(),
  /** プロフィール入力をスキップしてオンボーディングだけ完了にする */
  completeOnboardingSkipProfile: z.boolean().optional(),
  /** プロフィール保存と同時に初回オンボーディング完了にする（/onboarding 用） */
  finalizeOnboarding: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const user = await resolveDbUserFromSession({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
  });
  if (!user) {
    return NextResponse.json(
      { error: "セッションと一致するユーザーが見つかりません。再ログインしてください。" },
      { status: 401 },
    );
  }

  const serverSyncToken = user.updatedAt.toISOString();

  if (req.nextUrl.searchParams.get("syncCheck") === "1") {
    return NextResponse.json({ serverSyncToken }, JSON_NO_CACHE);
  }

  const counter = await getTodayCounter(user.id);
  const s = parseUserSettings(user.settings);

  return NextResponse.json(
    {
      email: user.email,
      encryptionMode: user.encryptionMode,
      defaultWeatherLocation: s.defaultWeatherLocation ?? null,
      profile: s.profile ?? {},
      serverSyncToken,
      limits: LIMITS,
      usageToday: {
        chatMessages: counter.chatMessages,
        imageGenerations: counter.imageGenerations,
        dailySummaries: counter.dailySummaries,
      },
      promptVersions: PROMPT_VERSIONS,
    },
    JSON_NO_CACHE,
  );
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const resolved = await resolveDbUserFromSession({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
  });
  if (!resolved) {
    return NextResponse.json(
      { error: "セッションと一致するユーザーが見つかりません。再ログインしてください。" },
      { status: 401 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "入力が不正です",
        ...(process.env.NODE_ENV !== "production" ? { details: parsed.error.flatten() } : {}),
      },
      { status: 400 },
    );
  }

  const existing = { settings: resolved.settings };

  const rawObj =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};

  let profilePatch: Partial<UserProfileSettings> | undefined;

  if (parsed.data.completeOnboardingSkipProfile) {
    const cur = parseUserSettings(existing.settings).profile ?? {};
    profilePatch = {
      ...cur,
      onboardingCompletedAt: new Date().toISOString(),
    };
  } else if (parsed.data.profile !== undefined) {
    const next: Partial<UserProfileSettings> = { ...(parsed.data.profile as Partial<UserProfileSettings>) };
    if (parsed.data.finalizeOnboarding) {
      next.onboardingCompletedAt = new Date().toISOString();
    }
    profilePatch = next;
  } else if (parsed.data.finalizeOnboarding) {
    const cur = parseUserSettings(existing.settings).profile ?? {};
    profilePatch = {
      ...cur,
      onboardingCompletedAt: new Date().toISOString(),
    };
  }

  const settingsPatch =
    "defaultWeatherLocation" in rawObj ||
    "profile" in rawObj ||
    "completeOnboardingSkipProfile" in rawObj ||
    "finalizeOnboarding" in rawObj
      ? mergeUserSettingsJson(existing.settings, {
          ...(parsed.data.defaultWeatherLocation !== undefined
            ? { defaultWeatherLocation: parsed.data.defaultWeatherLocation ?? null }
            : {}),
          ...(profilePatch !== undefined ? { profile: profilePatch } : {}),
        })
      : undefined;

  const user = await prisma.user.update({
    where: { id: resolved.id },
    data: {
      ...(parsed.data.encryptionMode
        ? { encryptionMode: parsed.data.encryptionMode }
        : {}),
      ...(settingsPatch !== undefined ? { settings: settingsPatch } : {}),
    },
  });

  const s = parseUserSettings(user.settings);

  return NextResponse.json(
    {
      serverSyncToken: user.updatedAt.toISOString(),
      user: {
        encryptionMode: user.encryptionMode,
        defaultWeatherLocation: s.defaultWeatherLocation ?? null,
        profile: s.profile ?? {},
      },
    },
    JSON_NO_CACHE,
  );
}
