import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_AUTH_EMAIL ?? "";
const TEST_PASSWORD = process.env.PLAYWRIGHT_AUTH_PASSWORD ?? "";

test.describe("PDF export", () => {
  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD,
    "PLAYWRIGHT_AUTH_EMAIL / PLAYWRIGHT_AUTH_PASSWORD not set",
  );

  test("PDF export downloads a non-empty file", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"));

    await page.goto("/summary");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PDF" }).click();
    const download = await downloadPromise;

    // Verify filename pattern
    expect(download.suggestedFilename()).toMatch(
      /^my-budget-\d{4}-\d{2}\.pdf$/,
    );

    // Verify non-zero-byte file
    const stream = await download.createReadStream();
    let size = 0;
    for await (const chunk of stream) {
      size += (chunk as Buffer).length;
    }
    expect(size).toBeGreaterThan(0);
  });
});
