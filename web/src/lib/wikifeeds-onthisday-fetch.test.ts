import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchOnThisDaySelectedForPrompt } from "./wikifeeds-onthisday";

describe("fetchOnThisDaySelectedForPrompt", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("ja が 404 のあと en で取得成功する", async () => {
    const enJson = { selected: [{ text: "Sample event" }] };
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url instanceof Request ? url.url : url.toString();
      if (u.includes("/wikipedia/ja/")) {
        return new Response(null, { status: 404 });
      }
      if (u.includes("/wikipedia/en/")) {
        return new Response(JSON.stringify(enJson), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(null, { status: 500 });
    }) as typeof fetch;

    const result = await fetchOnThisDaySelectedForPrompt({
      wikiLangPrimary: "ja",
      month: "05",
      day: "03",
      timeoutMs: 5000,
    });
    expect(result?.wikiLangUsed).toBe("en");
    expect(result?.lines.some((l) => l.includes("Sample"))).toBe(true);
  });

  it("selected が空なら null", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ selected: [] }), { status: 200 }),
    ) as typeof fetch;
    const result = await fetchOnThisDaySelectedForPrompt({
      wikiLangPrimary: "en",
      month: "12",
      day: "31",
      timeoutMs: 5000,
    });
    expect(result).toBeNull();
  });
});
