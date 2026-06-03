"use client";

import { cn } from "@/lib/utils";
import { signIn, signInWithGoogle } from "@/features/auth/server/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useTransition, useState } from "react";
import type { AppError } from "@/lib/errors";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [isPending, startTransition] = useTransition();
  const [appError, setAppError] = useState<AppError | null>(null);
  const [oauthError, setOauthError] = useState<AppError | null>(null);
  const [isOAuthPending, startOAuthTransition] = useTransition();

  function handleGoogleSignIn() {
    setOauthError(null);
    startOAuthTransition(async () => {
      const result = await signInWithGoogle();
      if (result.ok) {
        window.location.href = result.data.url;
      } else {
        setOauthError(result.error);
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAppError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signIn(formData);
      if (!result.ok) setAppError(result.error);
    });
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-ink-primary">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="email"
                  className="text-xs font-bold text-ink-primary"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="min-h-[44px]"
                />
                {appError?.field === "email" && (
                  <p className="text-xs text-destructive">{appError.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-xs font-bold text-ink-primary"
                  >
                    Password
                  </Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs text-ink-secondary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="min-h-[44px]"
                />
                {appError?.field === "password" && (
                  <p className="text-xs text-destructive">{appError.message}</p>
                )}
              </div>

              {appError && !appError.field && (
                <p className="text-sm text-destructive">{appError.message}</p>
              )}

              <Button
                type="submit"
                className="hover:bg-brand-accent-strong/90 min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
                disabled={isPending || isOAuthPending}
              >
                {isPending ? "Signing in…" : "Sign in"}
              </Button>
            </div>

            <div className="mt-4 text-center text-sm text-ink-secondary">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/sign-up"
                className="font-medium text-ink-primary underline underline-offset-4"
              >
                Sign up
              </Link>
            </div>

            <div className="my-2 mt-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-ink-secondary">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {oauthError && (
              <p className="text-center text-sm text-destructive">
                {oauthError.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md"
              disabled={isPending || isOAuthPending}
              onClick={handleGoogleSignIn}
              data-testid="sign-in-google"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {isOAuthPending ? "Redirecting…" : "Sign in with Google"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
