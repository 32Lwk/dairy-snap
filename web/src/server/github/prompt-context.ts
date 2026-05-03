import { prisma } from "@/server/db";

function formatSnapshotSummaryJa(summary: unknown): string {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "";
  const s = summary as Record<string, unknown>;
  const lines = s.linesJa;
  if (Array.isArray(lines)) {
    const parts = lines.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (parts.length) return parts.slice(0, 6).join(" / ");
  }
  const counts = s.counts;
  if (counts && typeof counts === "object" && !Array.isArray(counts)) {
    const c = counts as Record<string, unknown>;
    const push = typeof c.push === "number" ? c.push : 0;
    const pr = typeof c.pr === "number" ? c.pr : 0;
    const issue = typeof c.issue === "number" ? c.issue : 0;
    const review = typeof c.review === "number" ? c.review : 0;
    const other = typeof c.other === "number" ? c.other : 0;
    const sum = push + pr + issue + review + other;
    if (sum <= 0) return "";
    return `push ${push} / PR ${pr} / Issue ${issue} / レビュー ${review} / その他 ${other}`;
  }
  return "";
}

/** オーケストレーター system 用（日本語・捏造なし） */
export async function loadGithubOrchestratorBlock(userId: string, entryDateYmd: string): Promise<string | null> {
  const conn = await prisma.gitHubConnection.findUnique({
    where: { userId },
    select: { login: true, lastSyncError: true },
  });
  if (!conn) return null;

  const [day, snap] = await Promise.all([
    prisma.gitHubContributionDay.findUnique({
      where: { userId_dateYmd: { userId, dateYmd: entryDateYmd } },
      select: { contributionCount: true },
    }),
    prisma.gitHubDailySnapshot.findUnique({
      where: { userId_dateYmd: { userId, dateYmd: entryDateYmd } },
      select: { summary: true, updatedAt: true },
    }),
  ]);

  const contrib = day?.contributionCount ?? 0;
  const act = formatSnapshotSummaryJa(snap?.summary);
  const lines: string[] = [
    `GitHub ユーザー: @${conn.login}`,
    `対象日 ${entryDateYmd} のコントリビューション件数（GitHub カレンダー基準）: ${contrib}`,
  ];
  if (act) lines.push(`同日のイベント由来の要約（ユーザーTZ・参考）: ${act}`);
  if (conn.lastSyncError) {
    lines.push("※ 直近の同期に一部失敗がある可能性があります。事実の断定は避け、ユーザーに確認してよい。");
  }
  return lines.join("\n");
}

/** 日記草案プロンプト用の短いブロック */
export async function loadGithubJournalComposerBlock(
  userId: string,
  entryDateYmd: string,
): Promise<string | null> {
  const conn = await prisma.gitHubConnection.findUnique({ where: { userId }, select: { login: true } });
  if (!conn) return null;
  const block = await loadGithubOrchestratorBlock(userId, entryDateYmd);
  if (!block) return null;
  return ["## GitHub（参考・ユーザーが会話で触れていない内容は日記本文に無理に書かない）", block].join("\n");
}
