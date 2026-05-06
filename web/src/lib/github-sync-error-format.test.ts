import { describe, expect, it } from "vitest";
import { formatGithubSyncErrorForDisplay } from "./github-sync-error-format";

describe("formatGithubSyncErrorForDisplay", () => {
  it("maps known partial sync code", () => {
    const r = formatGithubSyncErrorForDisplay("github_sync_partial_or_failed");
    expect(r?.title).toContain("完了");
    expect(r?.technicalDetail).toBeNull();
  });

  it("maps Prisma transaction timeout jargon", () => {
    const raw =
      "Invalid `prisma.gitHubContributionDay.upsert()` invocation: Transaction API error: A rollback cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms";
    const r = formatGithubSyncErrorForDisplay(raw);
    expect(r?.title).toContain("時間");
    expect(r?.technicalDetail).toBe(raw);
  });

  it("returns null for empty", () => {
    expect(formatGithubSyncErrorForDisplay(null)).toBeNull();
    expect(formatGithubSyncErrorForDisplay("")).toBeNull();
    expect(formatGithubSyncErrorForDisplay("   ")).toBeNull();
  });
});
