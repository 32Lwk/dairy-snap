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
import { deleteEmbedding, syncMemoryLongTermEmbeddingsForUser } from "@/server/embeddings";
import { prisma } from "@/server/db";
import { incrementMemorySubAgentCalls } from "@/server/usage";

const MAX_SHORT_PER_ENTRY = 24;
const MAX_LONG_FETCH = 28;
const BODY_EXCERPT_LEN = 1200;
const DIARY_BODY_MAX_FOR_CONSOLIDATION = 12000;
const TRANSCRIPT_MAX = 20000;
const THREAD_RECONCILE_TRANSCRIPT_MAX = 28000;
const CHAT_BACKFILL_TRANSCRIPT_MAX = 42000;
const CHAT_BACKFILL_MESSAGE_TAKE = 350;

const AGENT_MEMORY_DOMAINS = [
  "orchestrator",
  "school",
  "calendar_daily",
  "calendar_work",
  "calendar_social",
  "hobby",
  "romance",
] as const;

const agentDomainSchema = z.enum(AGENT_MEMORY_DOMAINS);
const agentMemoryKeySchema = z.string().min(1).max(48).regex(/^[a-z][a-z0-9_]*$/);

function loadMasMemoryTurnPrompt(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", "mas-memory.md"), "utf8");
  } catch {
    return "You extract diary chat memory. Output JSON only.";
  }
}

function loadMasMemoryDiaryPrompt(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", "mas-memory-diary.md"), "utf8");
  } catch {
    return loadMasMemoryTurnPrompt();
  }
}

function loadMasMemoryThreadReconcilePrompt(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", "mas-memory-thread-reconcile.md"), "utf8");
  } catch {
    return loadMasMemoryDiaryPrompt();
  }
}

function loadMasMemoryChatBackfillPrompt(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", "mas-memory-chat-backfill.md"), "utf8");
  } catch {
    return loadMasMemoryThreadReconcilePrompt();
  }
}

const bulletList = z.array(z.string().max(400)).max(12);

const AGENT_DOMAIN_SET = new Set<string>(AGENT_MEMORY_DOMAINS);

function tryParseJsonValue(raw: string): unknown | null {
  const s = raw.trim();
  const candidates = [s];
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) candidates.push(s.slice(i, j + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c) as unknown;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** AgentMemory の memoryKey は DB と整合する英小文字＋アンダースコアのみ */
function normalizeAgentMemoryKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (s.length === 0) return null;
  if (!/^[a-z]/.test(s)) s = `k_${s}`;
  s = s.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!/^[a-z][a-z0-9_]*$/.test(s)) return null;
  return s.slice(0, 48);
}

function coerceSalience01(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === "string" ? parseFloat(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return undefined;
  let x = n;
  if (x > 1 && x <= 100) x = x / 100;
  return Math.max(0, Math.min(1, x));
}

function coerceImpactScore(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === "string" ? parseFloat(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeBulletArray(raw: unknown): string[] {
  if (typeof raw === "string") {
    return [raw.trim()].filter(Boolean).map((t) => t.slice(0, 400)).slice(0, 12);
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t) continue;
    out.push(t.slice(0, 400));
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Zod より前にモデル出力を正規化（配列超過・AgentMemory のキー形式・数値スケール違いなどで parse が落ちるのを防ぐ）
 */
function sanitizeMemoryDeltaForSchema(input: unknown): unknown {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };

  const strIds = (v: unknown, max: number) =>
    Array.isArray(v)
      ? (v.filter((x) => typeof x === "string") as string[]).slice(0, max)
      : [];

  o.shortTermDeleteIds = strIds(o.shortTermDeleteIds, 20);

  if (Array.isArray(o.shortTermUpserts)) {
    o.shortTermUpserts = o.shortTermUpserts
      .filter((row) => row && typeof row === "object" && !Array.isArray(row))
      .slice(0, 8)
      .map((row) => {
        const u = { ...(row as Record<string, unknown>) };
        u.bullets = normalizeBulletArray(u.bullets);
        const sal = coerceSalience01(u.salience);
        if (sal === undefined) delete u.salience;
        else u.salience = sal;
        if (u.dedupKey === null) delete u.dedupKey;
        if (typeof u.dedupKey === "string") u.dedupKey = u.dedupKey.trim().slice(0, 80);
        if (u.id === null) delete u.id;
        return u;
      });
  }

  o.longTermDeleteIds = strIds(o.longTermDeleteIds, 15);

  if (Array.isArray(o.longTermCreates)) {
    o.longTermCreates = o.longTermCreates
      .filter((row) => row && typeof row === "object" && !Array.isArray(row))
      .slice(0, 4)
      .map((row) => {
        const u = { ...(row as Record<string, unknown>) };
        u.bullets = normalizeBulletArray(u.bullets);
        const imp = coerceImpactScore(u.impactScore);
        if (imp === undefined) delete u.impactScore;
        else u.impactScore = imp;
        if (u.scope === "entry" || u.scope === "user") {
          /* keep */
        } else {
          delete u.scope;
        }
        return u;
      });
  }

  if (Array.isArray(o.longTermUpdates)) {
    o.longTermUpdates = o.longTermUpdates
      .filter((row) => row && typeof row === "object" && !Array.isArray(row))
      .slice(0, 10)
      .map((row) => {
        const u = { ...(row as Record<string, unknown>) };
        if (typeof u.id !== "string") return u;
        if (u.bullets !== undefined && u.bullets !== null) u.bullets = normalizeBulletArray(u.bullets);
        if (u.bullets !== undefined && Array.isArray(u.bullets) && (u.bullets as unknown[]).length === 0) delete u.bullets;
        const imp = coerceImpactScore(u.impactScore);
        if (imp === undefined) delete u.impactScore;
        else u.impactScore = imp;
        return u;
      })
      .filter((u) => typeof u.id === "string");
  }

  if (Array.isArray(o.agentMemoryDeletes)) {
    o.agentMemoryDeletes = o.agentMemoryDeletes
      .filter((row) => row && typeof row === "object" && !Array.isArray(row))
      .map((row) => {
        const u = { ...(row as Record<string, unknown>) };
        const dom = u.domain;
        const mk = normalizeAgentMemoryKey(u.memoryKey);
        if (typeof dom !== "string" || !AGENT_DOMAIN_SET.has(dom) || !mk) return null;
        return { domain: dom, memoryKey: mk };
      })
      .filter((x): x is { domain: string; memoryKey: string } => x != null)
      .slice(0, 20);
  }

  if (Array.isArray(o.agentMemoryUpserts)) {
    o.agentMemoryUpserts = o.agentMemoryUpserts
      .filter((row) => row && typeof row === "object" && !Array.isArray(row))
      .map((row) => {
        const u = { ...(row as Record<string, unknown>) };
        const dom = u.domain;
        const mk = normalizeAgentMemoryKey(u.memoryKey);
        const mv = typeof u.memoryValue === "string" ? u.memoryValue.trim().slice(0, 400) : "";
        if (typeof dom !== "string" || !AGENT_DOMAIN_SET.has(dom) || !mk || mv.length === 0) return null;
        return { domain: dom, memoryKey: mk, memoryValue: mv };
      })
      .filter((x): x is { domain: string; memoryKey: string; memoryValue: string } => x != null)
      .slice(0, 8);
  }

  return o;
}

/** モデルが null や snake_case を返す場合の緩和 */
function coerceMemoryDeltaJson(input: unknown): unknown {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  const alias: Record<string, string> = {
    short_term_delete_ids: "shortTermDeleteIds",
    short_term_upserts: "shortTermUpserts",
    long_term_delete_ids: "longTermDeleteIds",
    long_term_creates: "longTermCreates",
    long_term_updates: "longTermUpdates",
    agent_memory_deletes: "agentMemoryDeletes",
    agent_memory_upserts: "agentMemoryUpserts",
  };
  for (const [snake, camel] of Object.entries(alias)) {
    if (o[camel] === undefined && o[snake] !== undefined) {
      o[camel] = o[snake];
      delete o[snake];
    }
  }
  const arrKeys = [
    "shortTermDeleteIds",
    "shortTermUpserts",
    "longTermDeleteIds",
    "longTermCreates",
    "longTermUpdates",
    "agentMemoryDeletes",
    "agentMemoryUpserts",
  ] as const;
  for (const k of arrKeys) {
    const v = o[k];
    if (v === null || v === undefined) o[k] = [];
  }
  if (Array.isArray(o.shortTermUpserts)) {
    o.shortTermUpserts = o.shortTermUpserts.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      const u = { ...(row as Record<string, unknown>) };
      const b = u.bullets;
      if (typeof b === "string") u.bullets = [b];
      return u;
    });
  }
  if (Array.isArray(o.longTermCreates)) {
    o.longTermCreates = o.longTermCreates.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      const u = { ...(row as Record<string, unknown>) };
      const b = u.bullets;
      if (typeof b === "string") u.bullets = [b];
      return u;
    });
  }
  if (Array.isArray(o.longTermUpdates)) {
    o.longTermUpdates = o.longTermUpdates.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      const u = { ...(row as Record<string, unknown>) };
      const b = u.bullets;
      if (typeof b === "string") u.bullets = [b];
      return u;
    });
  }
  return o;
}

const memoryDeltaSchema = z.object({
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
        /** `user` = 特定の日に紐づけない長期（家族構成・恋愛の安定事実など）。省略時は entry 扱い */
        scope: z.enum(["entry", "user"]).optional(),
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
  agentMemoryDeletes: z
    .array(
      z.object({
        domain: agentDomainSchema,
        memoryKey: agentMemoryKeySchema,
      }),
    )
    .max(20)
    .default([]),
  agentMemoryUpserts: z
    .array(
      z.object({
        domain: agentDomainSchema,
        memoryKey: agentMemoryKeySchema,
        memoryValue: z.string().min(1).max(400),
      }),
    )
    .max(8)
    .default([]),
});

type MemoryDelta = z.infer<typeof memoryDeltaSchema>;

function scheduleLongTermEmbeddingSync(userId: string, delta: MemoryDelta): void {
  if (process.env.DISABLE_MEMORY_LONG_TERM_EMBEDDINGS === "1") return;
  void (async () => {
    for (const id of delta.longTermDeleteIds) {
      await deleteEmbedding(userId, "MEMORY_LONG_TERM", id).catch(() => {});
    }
    await syncMemoryLongTermEmbeddingsForUser(userId, 32).catch(() => {});
  })();
}

function parseMemoryDeltaJson(raw: string, userId: string): MemoryDelta | null {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/u, "").trim();
  }
  const j0 = tryParseJsonValue(s);
  if (j0 == null) return null;
  let j: unknown = coerceMemoryDeltaJson(j0);
  j = sanitizeMemoryDeltaForSchema(j);
  const r = memoryDeltaSchema.safeParse(j);
  if (!r.success) return null;
  void incrementMemorySubAgentCalls(userId).catch(() => {});
  return r.data;
}

type MemoryTx = {
  memoryLongTerm: typeof prisma.memoryLongTerm;
  memoryShortTerm: typeof prisma.memoryShortTerm;
  agentMemory: typeof prisma.agentMemory;
  auditLog: typeof prisma.auditLog;
};

export type MasMemoryChatTurn = { role: "user" | "assistant"; content: string };

/**
 * 本文変更時に日記統合パスを走らせるか。
 * - `MEMORY_DIARY_CONSOLIDATION_CROSS_CHARS`（正の整数）: 前回 &lt; N かつ 今回 ≥ N のとき true（しきい値通過）
 * - `MEMORY_DIARY_CONSOLIDATION_MIN_CHARS`（正の整数）: 上記に該当しない場合、今回の本文長が N 未満なら false（短文だけの保存ではスキップ）
 * - どちらも未設定: 本文が変われば true
 */
export function shouldRunMemoryDiaryConsolidationOnBodyChange(previousBody: string, nextBody: string): boolean {
  if (nextBody === previousBody) return false;
  const prevLen = previousBody.trim().length;
  const nextLen = nextBody.trim().length;

  const crossRaw = process.env.MEMORY_DIARY_CONSOLIDATION_CROSS_CHARS?.trim();
  if (crossRaw) {
    const cross = parseInt(crossRaw, 10);
    if (Number.isFinite(cross) && cross > 0 && prevLen < cross && nextLen >= cross) {
      return true;
    }
  }

  const minRaw = process.env.MEMORY_DIARY_CONSOLIDATION_MIN_CHARS?.trim();
  if (minRaw) {
    const min = parseInt(minRaw, 10);
    if (Number.isFinite(min) && min > 0 && nextLen < min) {
      return false;
    }
  }

  return true;
}

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

/** 短期メモを JSON メタ＋従来の箇条書きで提示（セクション混同防止のため id を露出） */
export async function loadShortTermContextStructuredForEntry(userId: string, entryId: string): Promise<string> {
  const rows = await prisma.memoryShortTerm.findMany({
    where: { userId, entryId },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, bullets: true, salience: true, dedupKey: true },
  });
  if (rows.length === 0) return "";
  const lines = rows
    .flatMap((r) => (Array.isArray(r.bullets) ? (r.bullets as string[]) : []))
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .slice(0, 18);
  const shortMeta = rows.map((r) => ({
    id: r.id,
    salience: r.salience,
    dedupKey: r.dedupKey,
    bulletPreview: (Array.isArray(r.bullets) ? (r.bullets as string[]) : [])
      .filter((x) => typeof x === "string")
      .slice(0, 3),
  }));
  const bulletsBlock = lines.map((l) => `- ${l.trim()}`).join("\n");
  return [
    "（このエントリ日の MemoryShortTerm のみ。長期プロフィールと混同しない）",
    "```json",
    JSON.stringify({ shortTermRows: shortMeta }),
    "```",
    "",
    bulletsBlock,
  ].join("\n");
}

async function loadLatestThreadTranscript(
  entryId: string,
  userId: string,
  maxChars: number = TRANSCRIPT_MAX,
  messageTake = 120,
): Promise<string> {
  const thread = await prisma.chatThread.findFirst({
    where: { entryId, entry: { userId } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!thread) return "";

  const roles = ["user", "assistant"];
  const count = await prisma.chatMessage.count({
    where: { threadId: thread.id, role: { in: roles } },
  });
  if (count === 0) return "";

  const skip = Math.max(0, count - messageTake);
  const messages = await prisma.chatMessage.findMany({
    where: { threadId: thread.id, role: { in: roles } },
    orderBy: { createdAt: "asc" },
    skip,
    take: messageTake,
    select: { role: true, content: true },
  });
  const lines = messages.map((m) => `[${m.role}] ${m.content}`);
  return lines.join("\n").slice(0, maxChars);
}

type MemorySubAgentResult =
  | { ok: true; delta: MemoryDelta }
  | { ok: false; reason: "llm" | "parse" };

async function callMemorySubAgent(
  system: string,
  userBlock: string,
  outputCap: number,
  userId: string,
): Promise<MemorySubAgentResult> {
  let raw = "{}";
  try {
    const openai = getOpenAI();
    const completion = await withChatModelFallback(
      getMemoryExtractionChatModel(),
      getMemoryExtractionChatFallbackModel(),
      (model) =>
        openai.chat.completions.create({
          model,
          ...chatCompletionOutputTokenLimit(model, outputCap),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: userBlock },
          ],
        }),
    );
    raw = completion.choices[0]?.message?.content ?? "{}";
  } catch {
    return { ok: false, reason: "llm" };
  }
  const parsed = parseMemoryDeltaJson(raw, userId);
  if (!parsed) return { ok: false, reason: "parse" };
  return { ok: true, delta: parsed };
}

async function applyMemoryDeltaTx(
  tx: MemoryTx,
  userId: string,
  entryId: string,
  parsed: MemoryDelta,
  auditSource: string,
): Promise<void> {
  for (const id of parsed.longTermDeleteIds) {
    const row = await tx.memoryLongTerm.findFirst({
      where: { id, userId },
    });
    if (!row) continue;
    await tx.memoryLongTerm.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId,
        entryId,
        action: "memory_long_term_delete",
        metadata: { memoryId: id, source: auditSource },
      },
    });
  }

  for (const id of parsed.shortTermDeleteIds) {
    const row = await tx.memoryShortTerm.findFirst({
      where: { id, userId, entryId },
    });
    if (!row) continue;
    await tx.memoryShortTerm.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId,
        entryId,
        action: "memory_short_term_delete",
        metadata: { memoryId: id, source: auditSource },
      },
    });
  }

  for (const u of parsed.longTermUpdates) {
    const row = await tx.memoryLongTerm.findFirst({
      where: { id: u.id, userId },
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
          userId,
          entryId,
          action: "memory_long_term_impact_change",
          metadata: { memoryId: u.id, prevImpact, nextImpact, source: auditSource },
        },
      });
    }
  }

  for (const c of parsed.longTermCreates) {
    const impact = Math.max(0, Math.min(100, c.impactScore ?? 15));
    const sourceEntryId = c.scope === "user" ? null : entryId;
    await tx.memoryLongTerm.create({
      data: {
        userId,
        sourceEntryId,
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
        where: { id: s.id, userId, entryId },
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
        where: { userId, entryId, dedupKey: s.dedupKey },
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
        userId,
        entryId,
        bullets,
        salience: sal,
        dedupKey: s.dedupKey && s.dedupKey.length > 0 ? s.dedupKey : null,
      },
    });
  }

  for (const d of parsed.agentMemoryDeletes) {
    const row = await tx.agentMemory.findFirst({
      where: { userId, domain: d.domain, memoryKey: d.memoryKey },
    });
    if (!row) continue;
    await tx.agentMemory.delete({
      where: { userId_domain_memoryKey: { userId, domain: d.domain, memoryKey: d.memoryKey } },
    });
    await tx.auditLog.create({
      data: {
        userId,
        entryId,
        action: "agent_memory_delete",
        metadata: { domain: d.domain, memoryKey: d.memoryKey, source: auditSource },
      },
    });
  }

  for (const u of parsed.agentMemoryUpserts) {
    const v = u.memoryValue.trim();
    if (!v) continue;
    await tx.agentMemory.upsert({
      where: { userId_domain_memoryKey: { userId, domain: u.domain, memoryKey: u.memoryKey } },
      create: { userId, domain: u.domain, memoryKey: u.memoryKey, memoryValue: v },
      update: { memoryValue: v },
    });
    await tx.auditLog.create({
      data: {
        userId,
        entryId,
        action: "agent_memory_upsert",
        metadata: { domain: u.domain, memoryKey: u.memoryKey, source: auditSource },
      },
    });
  }

  const shortCount = await tx.memoryShortTerm.count({
    where: { userId, entryId },
  });
  if (shortCount > MAX_SHORT_PER_ENTRY) {
    const overflow = shortCount - MAX_SHORT_PER_ENTRY;
    const victims = await tx.memoryShortTerm.findMany({
      where: { userId, entryId },
      orderBy: [{ salience: "asc" }, { updatedAt: "asc" }],
      take: overflow,
      select: { id: true },
    });
    for (const v of victims) {
      await tx.memoryShortTerm.delete({ where: { id: v.id } });
    }
  }
}

/** 1チャットターン完了ごと — 記憶サブエージェント（短期・長期・AgentMemory） */
export async function runMasMemoryExtraction(args: {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  encryptionMode: string;
  diaryBody: string;
  userMessage: string;
  assistantMessage: string;
  recentTurns: MasMemoryChatTurn[];
  threadId?: string;
  messageCountForSnapshot?: number;
}): Promise<{ ok: true } | { ok: false; reason: "disabled" | "unconfigured" | "llm" | "parse" | "db" }> {
  if (process.env.DISABLE_MEMORY_EXTRACTION === "1") return { ok: false, reason: "disabled" };
  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: "unconfigured" };

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

  const [shortExisting, longExisting, agentExisting] = await Promise.all([
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
    prisma.agentMemory.findMany({
      where: { userId: args.userId },
      orderBy: { updatedAt: "desc" },
      take: 56,
      select: { domain: true, memoryKey: true, memoryValue: true },
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
  const existingAgentJson = JSON.stringify(
    agentExisting.map((a) => ({
      domain: a.domain,
      memoryKey: a.memoryKey,
      memoryValue: a.memoryValue,
    })),
  );

  const system = loadMasMemoryTurnPrompt();
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
    "## 既存・AgentMemory JSON\n" + existingAgentJson,
    "",
    "Return JSON with keys: shortTermDeleteIds, shortTermUpserts, longTermDeleteIds, longTermCreates (optional scope entry|user), longTermUpdates, agentMemoryDeletes, agentMemoryUpserts.",
    "All lists may be empty arrays.",
  ].join("\n\n");

  const sub = await callMemorySubAgent(system, userBlock, 2200, args.userId);
  if (!sub.ok) return { ok: false, reason: sub.reason };

  try {
    await prisma.$transaction(async (tx) => {
      await applyMemoryDeltaTx(tx, args.userId, args.entryId, sub.delta, "mas_memory_turn");
    });
  } catch {
    return { ok: false, reason: "db" };
  }
  scheduleLongTermEmbeddingSync(args.userId, sub.delta);

  if (args.threadId && typeof args.messageCountForSnapshot === "number") {
    await prisma.chatThread.update({
      where: { id: args.threadId },
      data: {
        memoryChatBackfillAt: new Date(),
        memoryChatBackfillMsgCount: args.messageCountForSnapshot,
      },
    });
  }

  return { ok: true };
}

/** 日記本文へ AI 草案がマージされたあと — 全体を通した記憶の再整理 */
export async function runMasMemoryDiaryConsolidation(args: {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  encryptionMode: string;
  diaryBody: string;
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

  const [shortExisting, longExisting, agentExisting, transcript] = await Promise.all([
    prisma.memoryShortTerm.findMany({
      where: { userId: args.userId, entryId: args.entryId },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
    prisma.memoryLongTerm.findMany({
      where: { userId: args.userId },
      orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
      take: MAX_LONG_FETCH,
      select: { id: true, bullets: true, impactScore: true, sourceEntryId: true },
    }),
    prisma.agentMemory.findMany({
      where: { userId: args.userId },
      orderBy: { updatedAt: "desc" },
      take: 64,
      select: { domain: true, memoryKey: true, memoryValue: true },
    }),
    loadLatestThreadTranscript(args.entryId, args.userId, TRANSCRIPT_MAX),
  ]);

  const bodySection =
    args.encryptionMode === "STANDARD" && args.diaryBody.trim().length > 0
      ? `## Diary body (STANDARD, truncated)\n${args.diaryBody.slice(0, DIARY_BODY_MAX_FOR_CONSOLIDATION)}`
      : "## Diary body\n(not sent: E2EE or empty — use transcript only)";

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
  const existingAgentJson = JSON.stringify(
    agentExisting.map((a) => ({
      domain: a.domain,
      memoryKey: a.memoryKey,
      memoryValue: a.memoryValue,
    })),
  );

  const system = loadMasMemoryDiaryPrompt();
  const prefsBlock = formatMemoryHandlingForMasPrompt(prefs);
  const userBlock = [
    `## Target date\n${args.entryDateYmd}`,
    `## User memory preference block\n${prefsBlock}`,
    bodySection,
    "## 振り返りチャット要約用トランスクリプト（古い順・切り詰め）",
    transcript.trim() ? transcript : "（なし）",
    "## 既存・短期（この日のエントリ）JSON\n" + existingShortJson,
    "## 既存・長期 JSON\n" + existingLongJson,
    "## 既存・AgentMemory JSON\n" + existingAgentJson,
    "",
    "Return JSON with keys: shortTermDeleteIds, shortTermUpserts, longTermDeleteIds, longTermCreates (optional scope entry|user), longTermUpdates, agentMemoryDeletes, agentMemoryUpserts.",
    "Reconcile duplicates; promote stable facts to long-term; align AgentMemory with domain facts.",
  ].join("\n\n");

  const sub = await callMemorySubAgent(system, userBlock, 2600, args.userId);
  if (!sub.ok) return;

  await prisma.$transaction(async (tx) => {
    await applyMemoryDeltaTx(tx, args.userId, args.entryId, sub.delta, "mas_memory_diary");
  });
  scheduleLongTermEmbeddingSync(args.userId, sub.delta);
}

/**
 * チャットの編集・削除後 — 現在のスレッド全文を正として記憶を再整合（削除・更新・作成可）
 */
export async function runMasMemoryThreadReconcile(args: {
  userId: string;
  entryId: string;
  entryDateYmd: string;
  encryptionMode: string;
  diaryBody: string;
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

  const transcript = await loadLatestThreadTranscript(args.entryId, args.userId, THREAD_RECONCILE_TRANSCRIPT_MAX);
  if (!transcript.trim()) return;

  const [shortExisting, longExisting, agentExisting] = await Promise.all([
    prisma.memoryShortTerm.findMany({
      where: { userId: args.userId, entryId: args.entryId },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
    prisma.memoryLongTerm.findMany({
      where: { userId: args.userId },
      orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
      take: MAX_LONG_FETCH,
      select: { id: true, bullets: true, impactScore: true, sourceEntryId: true },
    }),
    prisma.agentMemory.findMany({
      where: { userId: args.userId },
      orderBy: { updatedAt: "desc" },
      take: 64,
      select: { domain: true, memoryKey: true, memoryValue: true },
    }),
  ]);

  const bodyExcerpt =
    args.encryptionMode === "STANDARD" && args.diaryBody.trim().length > 0
      ? args.diaryBody.slice(0, BODY_EXCERPT_LEN)
      : null;

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
  const existingAgentJson = JSON.stringify(
    agentExisting.map((a) => ({
      domain: a.domain,
      memoryKey: a.memoryKey,
      memoryValue: a.memoryValue,
    })),
  );

  const system = loadMasMemoryThreadReconcilePrompt();
  const prefsBlock = formatMemoryHandlingForMasPrompt(prefs);
  const userBlock = [
    `## Target date\n${args.entryDateYmd}`,
    `## User memory preference block\n${prefsBlock}`,
    bodyExcerpt
      ? `## Diary excerpt (STANDARD only)\n${bodyExcerpt}`
      : "## Diary body\n(not sent: E2EE or empty)",
    "## 現在のチャット全文（編集・削除後の正史・古い順）",
    transcript,
    "## 既存・短期（この日のエントリ）JSON\n" + existingShortJson,
    "## 既存・長期 JSON\n" + existingLongJson,
    "## 既存・AgentMemory JSON\n" + existingAgentJson,
    "",
    "The user may have edited or deleted chat messages. Reconcile memory: remove contradictions, update bullets, fix AgentMemory.",
    "Return JSON with keys: shortTermDeleteIds, shortTermUpserts, longTermDeleteIds, longTermCreates, longTermUpdates, agentMemoryDeletes, agentMemoryUpserts.",
    "For new long-term rows that are not specific to this calendar day, set longTermCreates[].scope to \"user\" (omit or \"entry\" for day-tied episodic promotion).",
  ].join("\n\n");

  const sub = await callMemorySubAgent(system, userBlock, 3000, args.userId);
  if (!sub.ok) return;

  await prisma.$transaction(async (tx) => {
    await applyMemoryDeltaTx(tx, args.userId, args.entryId, sub.delta, "mas_memory_thread_reconcile");
  });
  scheduleLongTermEmbeddingSync(args.userId, sub.delta);
}

export type MemoryChatBackfillResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "no_api_key" | "no_transcript" | "parse" | "llm" | "db" };

/**
 * 過去チャットが記憶パイプラインを通っていないときの補完 — スレッド末尾を中心に一括で反映
 */
export async function runMasMemoryChatHistoryBackfill(args: {
  userId: string;
  entryId: string;
  threadId: string;
  /** skip 判定と保存に使う（user+assistant の件数） */
  messageCountForSnapshot: number;
  entryDateYmd: string;
  encryptionMode: string;
  diaryBody: string;
}): Promise<MemoryChatBackfillResult> {
  if (process.env.DISABLE_MEMORY_EXTRACTION === "1") return { ok: false, reason: "disabled" };
  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: "no_api_key" };

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

  const transcript = await loadLatestThreadTranscript(
    args.entryId,
    args.userId,
    CHAT_BACKFILL_TRANSCRIPT_MAX,
    CHAT_BACKFILL_MESSAGE_TAKE,
  );
  if (!transcript.trim()) return { ok: false, reason: "no_transcript" };

  const [shortExisting, longExisting, agentExisting] = await Promise.all([
    prisma.memoryShortTerm.findMany({
      where: { userId: args.userId, entryId: args.entryId },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
    prisma.memoryLongTerm.findMany({
      where: { userId: args.userId },
      orderBy: [{ impactScore: "desc" }, { createdAt: "desc" }],
      take: MAX_LONG_FETCH,
      select: { id: true, bullets: true, impactScore: true, sourceEntryId: true },
    }),
    prisma.agentMemory.findMany({
      where: { userId: args.userId },
      orderBy: { updatedAt: "desc" },
      take: 64,
      select: { domain: true, memoryKey: true, memoryValue: true },
    }),
  ]);

  const bodyExcerpt =
    args.encryptionMode === "STANDARD" && args.diaryBody.trim().length > 0
      ? args.diaryBody.slice(0, BODY_EXCERPT_LEN)
      : null;

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
  const existingAgentJson = JSON.stringify(
    agentExisting.map((a) => ({
      domain: a.domain,
      memoryKey: a.memoryKey,
      memoryValue: a.memoryValue,
    })),
  );

  const system = loadMasMemoryChatBackfillPrompt();
  const prefsBlock = formatMemoryHandlingForMasPrompt(prefs);
  const userBlock = [
    `## Target date\n${args.entryDateYmd}`,
    `## User memory preference block\n${prefsBlock}`,
    bodyExcerpt
      ? `## Diary excerpt (STANDARD only)\n${bodyExcerpt}`
      : "## Diary body\n(not sent: E2EE or empty)",
    "## チャット全文（古い順・未処理分の取りこぼしを埋める）",
    transcript,
    "## 既存・短期（この日のエントリ）JSON\n" + existingShortJson,
    "## 既存・長期 JSON\n" + existingLongJson,
    "## 既存・AgentMemory JSON\n" + existingAgentJson,
    "",
    "Return JSON with keys: shortTermDeleteIds, shortTermUpserts, longTermDeleteIds, longTermCreates (optional scope entry|user), longTermUpdates, agentMemoryDeletes, agentMemoryUpserts.",
    "Fill gaps from the full transcript; do not erase grounded memories without contradiction.",
  ].join("\n\n");

  const sub = await callMemorySubAgent(system, userBlock, 6400, args.userId);
  if (!sub.ok) return { ok: false, reason: sub.reason };

  try {
    await prisma.$transaction(async (tx) => {
      await applyMemoryDeltaTx(tx, args.userId, args.entryId, sub.delta, "mas_memory_chat_backfill");
    });
  } catch {
    return { ok: false, reason: "db" };
  }

  scheduleLongTermEmbeddingSync(args.userId, sub.delta);

  await prisma.chatThread.update({
    where: { id: args.threadId },
    data: {
      memoryChatBackfillAt: new Date(),
      memoryChatBackfillMsgCount: args.messageCountForSnapshot,
    },
  });

  return { ok: true };
}
