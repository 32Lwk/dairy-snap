import { describe, expect, it } from "vitest";
import { formatYmdInTimeZone } from "@/lib/time/user-day-boundary";

describe("GitHub 連携向け TZ 暦日（formatYmdInTimeZone）", () => {
  it("同一インスタントが TZ で異なる暦日になりうる", () => {
    const d = new Date("2024-01-15T17:00:00.000Z");
    expect(formatYmdInTimeZone(d, "America/Los_Angeles")).toBe("2024-01-15");
    expect(formatYmdInTimeZone(d, "Asia/Tokyo")).toBe("2024-01-16");
  });

  it("UTC では ISO 日付と一致しやすい", () => {
    expect(formatYmdInTimeZone(new Date("2024-06-10T00:00:00.000Z"), "UTC")).toBe("2024-06-10");
  });
});
