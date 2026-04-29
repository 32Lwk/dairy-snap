import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { mergeUserSettingsJson, parseUserSettings, type UserProfileSettings } from "@/lib/user-settings";
import { normalizeProposeSettingsArgs, SETTINGS_APPLY_RATE_PER_24H } from "@/lib/settings-proposal-tool";
import { incrementSettingsChange } from "@/server/usage";
import { PROMPT_VERSIONS } from "@/server/prompts";

export type ApplySettingsResult =
  | {
      ok: true;
      previous: { dayBoundaryEndTime: string | null; timeZone: string | null };
      next: { dayBoundaryEndTime: string | null; timeZone: string | null };
    }
  | { ok: false; errorJa: string };

async function auditReject(params: {
  userId: string;
  entryId: string;
  threadId: string;
  reason: "rate_limit" | "validation" | "persist_failed";
  detail?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      entryId: params.entryId,
      action: "settings_agent_apply_rejected",
      metadata: {
        threadId: params.threadId,
        reason: params.reason,
        promptVersion: PROMPT_VERSIONS.reflective_chat,
        ...params.detail,
      },
    },
  });
}

/** Applies pending patch after user confirmation. Rate limit: successful applies per 24h (AuditLog)。 */
export async function applySettingsPatchFromChat(params: {
  userId: string;
  entryId: string;
  threadId: string;
  patch: { dayBoundaryEndTime?: string | null; timeZone?: string };
}): Promise<ApplySettingsResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.auditLog.count({
    where: {
      userId: params.userId,
      action: "settings_agent_apply",
      createdAt: { gte: since },
    },
  });
  if (recent >= SETTINGS_APPLY_RATE_PER_24H) {
    await auditReject({
      userId: params.userId,
      entryId: params.entryId,
      threadId: params.threadId,
      reason: "rate_limit",
      detail: { recentCount: recent, limit: SETTINGS_APPLY_RATE_PER_24H },
    });
    return {
      ok: false,
      errorJa:
        "設定の自動適用は24時間に5回までです。しばらくしてから試すか、設定画面から変更してください。",
    };
  }

  const rawNorm: Record<string, unknown> = {};
  if (params.patch.dayBoundaryEndTime !== undefined) rawNorm.dayBoundaryEndTime = params.patch.dayBoundaryEndTime;
  if (params.patch.timeZone !== undefined) rawNorm.timeZone = params.patch.timeZone;
  const validated = normalizeProposeSettingsArgs(rawNorm);
  if (!validated.ok) {
    await auditReject({
      userId: params.userId,
      entryId: params.entryId,
      threadId: params.threadId,
      reason: "validation",
      detail: { errorJa: validated.errorJa, rawPatch: params.patch },
    });
    return { ok: false, errorJa: validated.errorJa };
  }
  const normPatch = validated.patch;

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { settings: true, timeZone: true },
  });
  if (!user) {
    await auditReject({
      userId: params.userId,
      entryId: params.entryId,
      threadId: params.threadId,
      reason: "validation",
      detail: { errorJa: "ユーザーが見つかりません" },
    });
    return { ok: false, errorJa: "ユーザーが見つかりません。" };
  }

  const cur = parseUserSettings(user.settings);
  const prevBoundary = cur.dayBoundaryEndTime ?? null;
  const prevTz = cur.profile?.timeZone ?? user.timeZone ?? null;

  const profileMerge: Partial<UserProfileSettings> | undefined =
    normPatch.timeZone !== undefined ? { ...(cur.profile ?? {}), timeZone: normPatch.timeZone } : undefined;

  const mergedJson = mergeUserSettingsJson(user.settings, {
    ...(normPatch.dayBoundaryEndTime !== undefined ? { dayBoundaryEndTime: normPatch.dayBoundaryEndTime } : {}),
    ...(profileMerge !== undefined ? { profile: profileMerge } : {}),
  });

  let updated: { settings: unknown; timeZone: string };
  try {
    updated = await prisma.user.update({
      where: { id: params.userId },
      data: {
        settings: mergedJson,
        ...(normPatch.timeZone !== undefined ? { timeZone: normPatch.timeZone } : {}),
      },
      select: { settings: true, timeZone: true },
    });
  } catch (e) {
    await auditReject({
      userId: params.userId,
      entryId: params.entryId,
      threadId: params.threadId,
      reason: "persist_failed",
      detail: { message: String(e) },
    });
    return { ok: false, errorJa: "設定の保存に失敗しました。しばらくしてから試してください。" };
  }

  const after = parseUserSettings(updated.settings as Prisma.JsonValue);

  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      entryId: params.entryId,
      action: "settings_agent_apply",
      metadata: {
        threadId: params.threadId,
        patch: normPatch,
        previous: { dayBoundaryEndTime: prevBoundary, timeZone: prevTz },
        promptVersion: PROMPT_VERSIONS.reflective_chat,
      },
    },
  });

  await prisma.aIArtifact.create({
    data: {
      userId: params.userId,
      entryId: params.entryId,
      kind: "SETTINGS_PATCH",
      promptVersion: PROMPT_VERSIONS.reflective_chat,
      metadata: {
        threadId: params.threadId,
        patch: normPatch,
        previous: { dayBoundaryEndTime: prevBoundary, timeZone: prevTz },
      },
    },
  });

  await incrementSettingsChange(params.userId);

  return {
    ok: true,
    previous: { dayBoundaryEndTime: prevBoundary, timeZone: prevTz },
    next: {
      dayBoundaryEndTime: after.dayBoundaryEndTime ?? null,
      timeZone: after.profile?.timeZone ?? updated.timeZone ?? null,
    },
  };
}

export function isAffirmativeJaMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  const affirm = [
    "はい",
    "お願い",
    "お願いします",
    "ok",
    "okay",
    "了解",
    "いいよ",
    "いいです",
    "そうして",
    "適用",
    "それで",
    "うん",
    "yes",
    "y",
    "おk",
  ];
  if (affirm.some((a) => t === a || t.startsWith(`${a}。`) || t.startsWith(`${a}、`))) return true;
  if (/^(はい|うん|ok|了解|お願い)/i.test(t) && t.length <= 40) return true;
  return false;
}
