import { test, expect } from "@playwright/test";

test("PWA manifest is served with required fields", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.name).toBe("My Budget");
  expect(manifest.short_name).toBe("My Budget");
  expect(manifest.theme_color).toBe("#4FA6A6");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([expect.objectContaining({ purpose: "maskable" })]),
  );
});

test("app shell loads within 2 seconds (NFR-Performance)", async ({ page }) => {
  await page.goto("/");
  const loadTime = await page.evaluate(() => {
    const entries = performance.getEntriesByType("navigation");
    if (entries.length === 0) return 0;
    const nav = entries[0] as PerformanceNavigationTiming;
    return nav.loadEventEnd - nav.startTime;
  });
  expect(loadTime).toBeGreaterThan(0);
  expect(loadTime).toBeLessThan(2000);
});
