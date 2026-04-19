import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { formatMemoryHandlingForMasPrompt } from "@/lib/agent-persona-preferences";
import { getOpenAI } from "@/lib/ai/openai";
import {
  chatCompletionOutputTokenLimit,
  getMemoryExtractionChatFallbackModel,
  getMemoryExtractionChatModel,
} from "@/lib/ai/openai-chat-models";
import { withChatModelFallback } from "@/lib/ai/openai-model-fallback";
import { parseUserSettings } from "@/lib/user-settings";
import { prisma } from "@/server/db";

const MAX_SHORT_PER_ENTRY = 24;
const MAX_LONG_FETCH = 28;
const BODY_EXCERPT_LEN = 1200;

function loadMasMemoryPrompt(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", "mas-memory.md"), "utf8");
  } catch {
    return "You extract diary chat memory. Output JSON only.";
  }
}

const bulletList = z.array(z.string().max(400)).max(12);

const deltaSchema = z.object({
  shortTermDeleteIds: z.array(z.string()).max(20).default([]),
  shortTermUpserts: z
    .array(
      z.object({
        id: z.string().optional(),
        dedupKey: z.string().max(80).optional(),
        bullets: bulletList,
        salience: z.number().min(0).max(1).optional(),
      }),
    )
    .max(8)
    .default([]),
  longTermDeleteIds: z.array(z.string()).max(15).default([]),
  longTermCreates: z
    .array(
      z.object({
        bullets: bulletList,
        impactScore: z.number().min(0).max(100).optional(),
      }),
    )
    .max(4)
    .default([]),
  longTermUpdates: z
    .array(
      z.object({
        id: z.string(),
        bullets: bulletList.optional(),
        impactScore: z.number().min(0).max(100).optional(),
      }),
    )
    .max(10)
    .default([]),
});

export type MasMemoryChatTurn = { role: "user" | "assistant"; content: string };

export async function loadShortTermContextForEntry(userId: string, entryId: string): Promise<string> {
  const rows = await prisma.memoryShortTerm.findMany({
    where: { userId, entryId },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { bullets: true },
  });
  const lines = rows
    .flatMap((r) => (Array.isArray(r.bullets) ? (r.bullets as string[]) : []))
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .slice(0, 18);
  if (lines.length === 0) return "";
  return lines.map((l) => `- ${l.trim()}`).join("\n");
}

export async function runMasMemoryExtraction(args: {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  encryptionMode: string;
  diaryBody: string;
  userMessage: string;
  assistantMessage: string;
  recentTurns: MasMemoryChatTurn[];
}): Promise<void> {
  if (process.env.DISABLE_MEMORY_EXTRACTION === "1") return;
  if (!process.env.OPENAI_API_KEY) return;

  const userRow = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { settings: true },
  });
  const profile = parseUserSettings(userRow?.settings ?? {}).profile;
  const prefs = {
    aiMemoryRecallStyle: profile?.aiMemoryRecallStyle,
    aiMemoryNamePolicy: profile?.aiMemoryNamePolicy,
    aiMemoryForgetBias: profile?.aiMemoryForgetBias,
  };

  const [shortExisting, longExisting] = await Promise.all([
    prisma.memoryShortTerm.findMany({
      where: { userId: args.userId, entryId: args.entryId },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.memoryLongTerm.findMany({
      where: { userId: args.userId },
      orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
      take: MAX_LONG_FETCH,
      select: { id: true, bullets: true, impactScore: true, sourceEntryId: true },
    }),
  ]);

  const bodyExcerpt =
    args.encryptionMode === "STANDARD" && args.diaryBody.trim().length > 0
      ? args.diaryBody.slice(0, BODY_EXCERPT_LEN)
      : null;

  const transcript = args.recentTurns
    .slice(-14)
    .map((t) => `[${t.role}] ${t.content.slice(0, 4000)}`)
    .join("\n");

  const existingShortJson = JSON.stringify(
    shortExisting.map((s) => ({
      id: s.id,
      dedupKey: s.dedupKey,
      salience: s.salience,
      bullets: Array.isArray(s.bullets) ? s.bullets : [],
    })),
  );
  const existingLongJson = JSON.stringify(
    longExisting.map((l) => ({
      id: l.id,
      impactScore: l.impactScore,
      sourceEntryId: l.sourceEntryId,
      bullets: Array.isArray(l.bullets) ? l.bullets : [],
    })),
  );

  const system = loadMasMemoryPrompt();
  const prefsBlock = formatMemoryHandlingForMasPrompt(prefs);
  const userBlock = [
    `## Target date\n${args.entryDateYmd}`,
    `## User memory preference block\n${prefsBlock}`,
    bodyExcerpt
      ? `## Diary excerpt (STANDARD only)\n${bodyExcerpt}`
      : "## Diary body\n(not sent: E2EE or empty)",
    "## いまのターン",
    `[user] ${args.userMessage.slice(0, 8000)}`,
    `[assistant] ${args.assistantMessage.slice(0, 8000)}`,
    "## 直近の会話（古い順・最大14ターン）",
    transcript || "（なし）",
    "## 既存・短期（この日のエントリ）JSON\n" + existingShortJson,
    "## 既存・長期 JSON\n" + existingLongJson,
    "",
    "Return JSON with keys: shortTermDeleteIds, shortTermUpserts, longTermDeleteIds, longTermCreates, longTermUpdates.",
    "All lists may be empty arrays.",
  ].join("\n\n");

  let raw = "{}";
  try {
    const openai = getOpenAI();
    const completion = await withChatModelFallback(
      getMemoryExtractionChatModel(),
      getMemoryExtractionChatFallbackModel(),
      (model) =>
        openai.chat.completions.create({
          model,
          ...chatCompletionOutputTokenLimit(model, 1800),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: userBlock },
          ],
        }),
    );
    raw = completion.choices[0]?.message?.content ?? "{}";
  } catch {
    return;
  }

  let parsed: z.infer<typeof deltaSchema>;
  try {
    const j = JSON.parse(raw) as unknown;
    parsed = deltaSchema.parse(j);
  } catch {
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const id of parsed.longTermDeleteIds) {
      const row = await tx.memoryLongTerm.findFirst({
        where: { id, userId: args.userId },
      });
      if (!row) continue;
      await tx.memoryLongTerm.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: args.userId,
          entryId: args.entryId,
          action: "memory_long_term_delete",
          metadata: { memoryId: id, source: "mas_extraction" },
        },
      });
    }

    for (const id of parsed.shortTermDeleteIds) {
      const row = await tx.memoryShortTerm.findFirst({
        where: { id, userId: args.userId, entryId: args.entryId },
      });
      if (!row) continue;
      await tx.memoryShortTerm.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: args.userId,
          entryId: args.entryId,
          action: "memory_short_term_delete",
          metadata: { memoryId: id, source: "mas_extraction" },
        },
      });
    }

    for (const u of parsed.longTermUpdates) {
      const row = await tx.memoryLongTerm.findFirst({
        where: { id: u.id, userId: args.userId },
      });
      if (!row) continue;
      const prevImpact = row.impactScore;
      const nextBullets = u.bullets ?? (Array.isArray(row.bullets) ? (row.bullets as string[]) : []);
      const nextImpact = u.impactScore ?? prevImpact;
      await tx.memoryLongTerm.update({
        where: { id: u.id },
        data: {
          bullets: nextBullets,
          impactScore: Math.max(0, Math.min(100, nextImpact)),
        },
      });
      if (Math.abs(nextImpact - prevImpact) >= 8) {
        await tx.auditLog.create({
          data: {
            userId: args.userId,
            entryId: args.entryId,
            action: "memory_long_term_impact_change",
            metadata: { memoryId: u.id, prevImpact, nextImpact, source: "mas_extraction" },
          },
        });
      }
    }

    for (const c of parsed.longTermCreates) {
      const impact = Math.max(0, Math.min(100, c.impactScore ?? 15));
      await tx.memoryLongTerm.create({
        data: {
          userId: args.userId,
          sourceEntryId: args.entryId,
          bullets: c.bullets,
          impactScore: impact,
        },
      });
    }

    for (const s of parsed.shortTermUpserts) {
      const sal = Math.max(0, Math.min(1, s.salience ?? 0.5));
      const bullets = s.bullets.map((b) => b.trim()).filter(Boolean);
      if (bullets.length === 0) continue;

      if (s.id) {
        const row = await tx.memoryShortTerm.findFirst({
          where: { id: s.id, userId: args.userId, entryId: args.entryId },
        });
        if (row) {
          await tx.memoryShortTerm.update({
            where: { id: s.id },
            data: {
              bullets,
              salience: sal,
              ...(s.dedupKey != null && s.dedupKey !== "" ? { dedupKey: s.dedupKey } : {}),
            },
          });
          continue;
        }
      }

      if (s.dedupKey) {
        const hit = await tx.memoryShortTerm.findFirst({
          where: { userId: args.userId, entryId: args.entryId, dedupKey: s.dedupKey },
        });
        if (hit) {
          await tx.memoryShortTerm.update({
            where: { id: hit.id },
            data: { bullets, salience: sal },
          });
          continue;
        }
      }

      await tx.memoryShortTerm.create({
        data: {
          userId: args.userId,
          entryId: args.entryId,
          bullets,
          salience: sal,
          dedupKey: s.dedupKey && s.dedupKey.length > 0 ? s.dedupKey : null,
        },
      });
    }

    const shortCount = await tx.memoryShortTerm.count({
      where: { userId: args.userId, entryId: args.entryId },
    });
    if (shortCount > MAX_SHORT_PER_ENTRY) {
      const overflow = shortCount - MAX_SHORT_PER_ENTRY;
      const victims = await tx.memoryShortTerm.findMany({
        where: { userId: args.userId, entryId: args.entryId },
        orderBy: [{ salience: "asc" }, { updatedAt: "asc" }],
        take: overflow,
        select: { id: true },
      });
      for (const v of victims) {
        await tx.memoryShortTerm.delete({ where: { id: v.id } });
      }
    }
  });
}
