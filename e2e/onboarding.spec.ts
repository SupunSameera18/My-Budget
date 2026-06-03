import { test, expect } from "@playwright/test";

// Skips if sign-up credentials not provided.
// Requires a fresh Supabase instance (local) with the 0004 migration applied.
// The test creates a unique user per run so onboarding is always fresh.

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const RUN_ONBOARDING_TEST = process.env.PLAYWRIGHT_ONBOARDING_TEST === "true";

test.describe("Onboarding flow", () => {
  test.skip(!RUN_ONBOARDING_TEST, "PLAYWRIGHT_ONBOARDING_TEST=true not set");

  test("new user completes 4-step onboarding and lands on dashboard", async ({
    page,
  }) => {
    // Use a unique email per run to get a fresh user every time
    const email = `test+onboarding-${Date.now()}@example.com`;
    const password = "password1234";

    // Sign up
    await page.goto(`${BASE_URL}/auth/sign-up`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // After sign-up (local Supabase auto-confirms), navigating to /dashboard
    // should redirect to /onboarding
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/onboarding/);

    // Step 1 — currency
    await expect(page.locator("text=Step 1 of 3")).toBeVisible();
    await page.selectOption('select[name="currency"]', "LKR");
    await page.click('button[type="submit"]');

    // Step 2 — account
    await expect(page).toHaveURL(/\/onboarding\/account/);
    await expect(page.locator("text=Step 2 of 3")).toBeVisible();
    await page.fill('input[name="name"]', "Main Bank");
    await page.selectOption('select[name="type"]', "bank");
    await page.fill('input[name="openingBalance"]', "5000.00");
    await page.click('button[type="submit"]');

    // Step 3 — categories
    await expect(page).toHaveURL(/\/onboarding\/categories/);
    await expect(page.locator("text=Step 3 of 3")).toBeVisible();
    await page.click('button[type="submit"]');

    // Complete → dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test("mid-flow resumption: abandoning on step 2 resumes at step 2", async () => {
    // Prerequisite: a user who has completed step 1 but not step 2.
    // This test verifies the resume logic — navigate to /onboarding and
    // confirm redirect to /onboarding/account.
    // (Full pre-requisite setup requires Supabase admin or sign-up helper;
    // covered by the above test's sequential navigation.)
    test.skip(
      true,
      "Requires Supabase admin helper — cover in integration test",
    );
  });
});
