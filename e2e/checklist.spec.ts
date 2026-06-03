import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const RUN_CHECKLIST_TEST = process.env.PLAYWRIGHT_CHECKLIST_TEST === "true";

test.describe("First-run checklist", () => {
  test.skip(!RUN_CHECKLIST_TEST, "PLAYWRIGHT_CHECKLIST_TEST=true not set");

  test("new user sees checklist on dashboard after onboarding", async ({
    page,
  }) => {
    const email = `test+checklist-${Date.now()}@example.com`;
    const password = "password1234";

    // Sign up
    await page.goto(`${BASE_URL}/auth/sign-up`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Complete onboarding steps
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.selectOption('select[name="currency"]', "USD");
    await page.click('button[type="submit"]');
    await page.fill('input[name="name"]', "Test Bank");
    await page.selectOption('select[name="type"]', "bank");
    await page.click('button[type="submit"]');
    await page.click('button[type="submit"]'); // categories step
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

    // Assert checklist is visible
    await expect(
      page.getByRole("region", { name: "Setup checklist" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Log your first transaction" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create a budget" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Set a goal" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Invite your partner" }),
    ).toBeVisible();
  });

  test("Log your first transaction button links to /transactions/new", async () => {
    test.skip(
      true,
      "Requires shared state from previous test or pre-seeded user",
    );
  });

  test("user with checklist_completed_at set does not see checklist", async () => {
    test.skip(true, "Requires Supabase admin helper for DB seeding");
  });
});
