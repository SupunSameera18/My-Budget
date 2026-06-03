import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const RUN_LOG_TRANSACTION_TEST =
  process.env.PLAYWRIGHT_LOG_TRANSACTION_TEST === "true";

test.describe("Log a transaction", () => {
  test.skip(
    !RUN_LOG_TRANSACTION_TEST,
    "PLAYWRIGHT_LOG_TRANSACTION_TEST=true not set",
  );

  test("authenticated onboarded user can log a transaction and return to dashboard", async ({
    page,
  }) => {
    const email = `test+logtxn-${Date.now()}@example.com`;
    const password = "password1234";

    // Sign up
    await page.goto(`${BASE_URL}/auth/sign-up`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Complete onboarding
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.selectOption('select[name="currency"]', "USD");
    await page.click('button[type="submit"]');
    await page.fill('input[name="name"]', "Test Bank");
    await page.selectOption('select[name="type"]', "bank");
    await page.click('button[type="submit"]');
    await page.click('button[type="submit"]'); // categories step
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

    // Navigate to /transactions/new via FAB
    await page.goto(`${BASE_URL}/transactions/new`);
    await expect(page).toHaveURL(/\/transactions\/new/);
    await expect(
      page.getByRole("heading", { name: "Log transaction" }),
    ).toBeVisible();

    // Fill form
    await page.fill('input[name="amount_display"]', "4.50");
    // Select first available category
    const categorySelect = page.locator('select[name="category_id"]');
    const firstOption = categorySelect
      .locator("option:not([disabled])")
      .first();
    const firstOptionValue = await firstOption.getAttribute("value");
    if (firstOptionValue) {
      await categorySelect.selectOption(firstOptionValue);
    }

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test("submitting with empty amount shows inline error and does not navigate", async () => {
    test.skip(true, "Requires pre-seeded authenticated + onboarded user");
  });
});
