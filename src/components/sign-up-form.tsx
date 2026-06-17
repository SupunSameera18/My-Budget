"use client";

import { cn } from "@/lib/utils";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { signUp, signInWithGoogle } from "@/features/auth/server/actions";
import { signUpSchema } from "@/features/auth/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useTransition, useState } from "react";
import type { AppError } from "@/lib/errors";

type FieldErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
    setFieldErrors({});
    setAppError(null);

    const formData = new FormData(e.currentTarget);
    const raw = Object.fromEntries(formData);

    // Client-side validation before server round-trip
    const parsed = signUpSchema.safeParse(raw);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (field && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    startTransition(async () => {
      const result = await signUp(formData);
      if (!result.ok) {
        if (result.error.field) {
          setFieldErrors({ [result.error.field]: result.error.message });
        } else {
          setAppError(result.error);
        }
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-ink-primary">
            Create account
          </CardTitle>
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
                {fieldErrors.email && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="password"
                  className="text-xs font-bold text-ink-primary"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="min-h-[44px]"
                />
                {fieldErrors.password && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="confirmPassword"
                  className="text-xs font-bold text-ink-primary"
                >
                  Confirm password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="min-h-[44px]"
                />
                {fieldErrors.confirmPassword && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {appError && (
                <p className="text-sm text-destructive">{appError.message}</p>
              )}

              <Button
                type="submit"
                className="hover:bg-brand-accent-strong/90 min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
                disabled={isPending || isOAuthPending}
              >
                {isPending ? "Creating account…" : "Create account"}
              </Button>
            </div>

            <div className="mt-4 text-center text-sm text-ink-secondary">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="font-medium text-ink-primary underline underline-offset-4"
              >
                Sign in
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
              data-testid="sign-up-google"
            >
              <GoogleIcon />
              {isOAuthPending ? "Redirecting…" : "Continue with Google"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
