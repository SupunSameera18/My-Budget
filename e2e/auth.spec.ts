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

  test("wrong password shows an error message", async ({ page }) => {
    // [1-4b] wrong-password error message
    await page.goto("/auth/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', "wrong-password-that-will-fail");
    await page.click('button[type="submit"]');
    // Stay on login page with an error
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(
      page.getByRole("alert").or(page.locator("[role='status']")),
    ).toContainText(/invalid|incorrect|wrong|credentials/i);
  });

  test("duplicate email sign-up shows an error message", async ({ page }) => {
    // [1-4b] dup-email error — try to register with an already-registered email
    await page.goto("/auth/sign-up");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', "SomeNewPassword123!");
    await page.click('button[type="submit"]');
    // Stay on sign-up page or login page with an error message
    await expect(
      page
        .getByText(/already registered|already exists|email.*taken/i)
        .or(page.getByRole("alert")),
    ).toBeVisible({ timeout: 5000 });
  });

  test("real sign-out button redirects to /auth/login", async ({ page }) => {
    // [1-4b] test the actual sign-out button (not cookie clearing)
    await page.goto("/auth/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // Click the real Logout button (exists in sidebar / more menu)
    // The LogoutButton renders as <button>Logout</button>
    const logoutBtn = page
      .getByRole("button", { name: /logout/i })
      .or(page.getByRole("link", { name: /sign out|log out/i }))
      .first();
    await logoutBtn.click();

    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
  });

  test("password reset page is accessible from login", async ({ page }) => {
    // [1-4b] password reset flow — verify the reset form renders
    await page.goto("/auth/login");
    // Find forgot-password link
    const forgotLink = page.getByRole("link", { name: /forgot|reset/i });
    if (await forgotLink.isVisible()) {
      await forgotLink.click();
    } else {
      await page.goto("/auth/forgot-password");
    }
    await expect(page).toHaveURL(/\/auth\/forgot-password|\/auth\/reset/);
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  });

  test("password reset with valid email shows confirmation message", async ({
    page,
  }) => {
    // [1-4b] password reset — submitting a valid email shows a confirmation
    await page.goto("/auth/forgot-password");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.click('button[type="submit"]');
    // Expect a success/confirmation message (OTP/code sent)
    await expect(
      page.getByText(/check your email|code sent|sent a/i),
    ).toBeVisible({ timeout: 5000 });
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

  test("OAuth callback error query param shows an error message", async ({
    page,
  }) => {
    // [1-5] OAuth callback with error param — verify the UI shows an error
    await page.goto(
      "/auth/callback?error=access_denied&error_description=User+cancelled",
    );
    // Should redirect to login or show an error on the current page
    await expect(
      page
        .getByText(/access denied|error|failed|cancelled/i)
        .or(page.getByRole("alert")),
    ).toBeVisible({ timeout: 5000 });
  });
});
