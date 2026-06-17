"use client";

import { cn } from "@/lib/utils";
import { signIn, signInWithGoogle } from "@/features/auth/server/actions";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
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
              <GoogleIcon />
              {isOAuthPending ? "Redirecting…" : "Sign in with Google"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
