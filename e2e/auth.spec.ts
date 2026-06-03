import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.PLAYWRIGHT_AUTH_EMAIL ?? "";
const TEST_PASSWORD = process.env.PLAYWRIGHT_AUTH_PASSWORD ?? "";

test.describe("Auth flows", () => {
  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD,
    "PLAYWRIGHT_AUTH_EMAIL / PLAYWRIGHT_AUTH_PASSWORD not set",
  );

  test("unauthenticated user is redirected to /auth/login", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("sign in with valid credentials lands in app", async ({ page }) => {
    await page.goto("/auth/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");
  });

  test("sign out redirects to /auth/login", async ({ page }) => {
    // Sign in first
    await page.goto("/auth/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // Clear cookies to simulate sign-out, then verify redirect
    // (Full sign-out button wired in Story 1.9+; middleware auth check covers the AC)
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe("OAuth flows", () => {
  test("Google sign-in button is visible on login page", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByTestId("sign-in-google")).toBeVisible();
  });

  test("Google sign-in button is enabled and accessible on login page", async ({
    page,
  }) => {
    await page.goto("/auth/login");
    const btn = page.getByTestId("sign-in-google");
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAccessibleName(/google/i);
  });

  test("Google sign-in button is visible on sign-up page", async ({ page }) => {
    await page.goto("/auth/sign-up");
    await expect(page.getByTestId("sign-up-google")).toBeVisible();
  });

  test("clicking Google sign-in initiates redirect to Supabase OAuth endpoint", async ({
    page,
    context,
  }) => {
    let capturedOAuthUrl = "";

    // Intercept and abort the navigation to the Supabase OAuth authorize endpoint.
    // This stubs out the Google leg so no real credentials are needed.
    await context.route(
      (url) =>
        url.pathname.includes("/auth/v1/authorize") ||
        url.host.includes("accounts.google.com"),
      (route) => {
        capturedOAuthUrl = route.request().url();
        route.abort();
      },
    );

    await page.goto("/auth/login");
    await page.getByTestId("sign-in-google").click();

    // Poll until the OAuth redirect is intercepted (server action → Supabase → browser nav)
    await expect
      .poll(() => capturedOAuthUrl, { timeout: 5000 })
      .toContain("/auth/v1/authorize");

    expect(capturedOAuthUrl).toContain("provider=google");
  });
});
