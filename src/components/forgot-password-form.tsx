"use client";

import { cn } from "@/lib/utils";
import { resetPassword } from "@/features/auth/server/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useTransition, useState } from "react";
import type { AppError } from "@/lib/errors";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [appError, setAppError] = useState<AppError | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAppError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await resetPassword(formData);
      if (result.ok) {
        setSuccess(true);
      } else {
        setAppError(result.error);
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-ink-primary">
              Check your inbox
            </CardTitle>
            <CardDescription>Password reset link sent</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-secondary">
              If that email is registered, you&apos;ll receive a reset link
              shortly. Check your spam folder if it doesn&apos;t arrive.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-ink-primary">
              Reset password
            </CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a reset link.
            </CardDescription>
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
                    <p className="text-xs text-destructive">
                      {appError.message}
                    </p>
                  )}
                </div>

                {appError && !appError.field && (
                  <p className="text-sm text-destructive">{appError.message}</p>
                )}

                <Button
                  type="submit"
                  className="hover:bg-brand-accent-strong/90 min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
                  disabled={isPending}
                >
                  {isPending ? "Sending…" : "Send reset link"}
                </Button>
              </div>

              <div className="mt-4 text-center text-sm text-ink-secondary">
                Remember your password?{" "}
                <Link
                  href="/auth/login"
                  className="font-medium text-ink-primary underline underline-offset-4"
                >
                  Sign in
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
