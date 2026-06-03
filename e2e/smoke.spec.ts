import { test, expect } from "@playwright/test";

// End-to-end seam (Story 1.1 AC3): the app shell loads and an unauthenticated
// user hitting a protected route is routed to sign-in (/auth/login).

test("app shell loads on the home page", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status() ?? 200).toBeLessThan(400);
  await expect(page.locator("body")).toBeVisible();
});

test("unauthenticated user is routed to sign-in", async ({ page }) => {
  await page.goto("/protected");
  await expect(page).toHaveURL(/\/auth\/login$/);
});
