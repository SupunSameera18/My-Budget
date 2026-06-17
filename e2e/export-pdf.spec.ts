import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_AUTH_EMAIL ?? "";
const TEST_PASSWORD = process.env.PLAYWRIGHT_AUTH_PASSWORD ?? "";

test.describe("PDF export", () => {
  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD,
    "PLAYWRIGHT_AUTH_EMAIL / PLAYWRIGHT_AUTH_PASSWORD not set",
  );

  test("PDF export downloads a file with valid PDF magic bytes", async ({
    page,
  }) => {
    // [6-6b] ExportPdf success + magic bytes verification
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
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const buf = Buffer.concat(chunks);
    expect(buf.length).toBeGreaterThan(0);

    // Verify PDF magic bytes: every valid PDF starts with "%PDF-"
    // (0x25 0x50 0x44 0x46 0x2D)
    expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
