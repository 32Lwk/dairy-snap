import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api/require-session";
import { isMbtiType } from "@/lib/mbti";
import {
  mergeUserSettingsJson,
  parseUserSettings,
  type UserProfileSettings,
} from "@/lib/user-settings";
import { prisma } from "@/server/db";
import { PROMPT_VERSIONS } from "@/server/prompts";
import { LIMITS, getTodayCounter } from "@/server/usage";

const mbtiField = z
  .string()
  .max(8)
  .refine((s) => s === "" || isMbtiType(s), { message: "MBTI は16タイプの英字4文字" });

const profilePatchSchema = z
  .object({
    nickname: z.string().max(80).optional(),
    birthDate: z.string().max(32).optional(),
    zodiac: z.string().max(120).optional(),
    bloodType: z.string().max(32).optional(),
    education: z.string().max(2000).optional(),
    mbti: mbtiField.optional(),
    loveMbti: mbtiField.optional(),
    hobbies: z.string().max(2000).optional(),
    interests: z.string().max(2000).optional(),
    interestPicks: z.array(z.string().max(120)).max(80).optional(),
    preferences: z.string().max(4000).optional(),
    onboardingCompletedAt: z.string().max(64).optional(),
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

export async function GET() {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const counter = await getTodayCounter(session.user.id);
  if (!user) return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });

  const s = parseUserSettings(user.settings);

  return NextResponse.json({
    email: user.email,
    encryptionMode: user.encryptionMode,
    defaultWeatherLocation: s.defaultWeatherLocation ?? null,
    profile: s.profile ?? {},
    limits: LIMITS,
    usageToday: {
      chatMessages: counter.chatMessages,
      imageGenerations: counter.imageGenerations,
      dailySummaries: counter.dailySummaries,
    },
    promptVersions: PROMPT_VERSIONS,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if ("response" in session) return session.response;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { settings: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

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
    profilePatch = { ...parsed.data.profile };
    if (parsed.data.finalizeOnboarding) {
      profilePatch.onboardingCompletedAt = new Date().toISOString();
    }
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
    where: { id: session.user.id },
    data: {
      ...(parsed.data.encryptionMode
        ? { encryptionMode: parsed.data.encryptionMode }
        : {}),
      ...(settingsPatch !== undefined ? { settings: settingsPatch } : {}),
    },
  });

  const s = parseUserSettings(user.settings);

  return NextResponse.json({
    user: {
      encryptionMode: user.encryptionMode,
      defaultWeatherLocation: s.defaultWeatherLocation ?? null,
      profile: s.profile ?? {},
    },
  });
}
