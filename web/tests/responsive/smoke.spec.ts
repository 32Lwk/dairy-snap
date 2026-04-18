import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

test.describe("responsive smoke (public routes)", () => {
  for (const vp of viewports) {
    test(`login renders at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
    });
  }
});
