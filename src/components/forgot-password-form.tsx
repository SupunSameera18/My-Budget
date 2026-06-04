"use client";

import { cn } from "@/lib/utils";
import {
  resetPassword,
  resetPasswordWithOtp,
} from "@/features/auth/server/actions";
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

type Step = "request" | "enter_code";

type FieldErrors = {
  email?: string;
  otp?: string;
  password?: string;
  confirmPassword?: string;
};

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("request");
  const [sentEmail, setSentEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [appError, setAppError] = useState<AppError | null>(null);

  function handleRequestCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setAppError(null);
    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string | null) ?? "";
    startTransition(async () => {
      const result = await resetPassword(formData);
      if (result.ok) {
        setSentEmail(email);
        setStep("enter_code");
      } else {
        if (result.error.field) {
          setFieldErrors({ [result.error.field]: result.error.message });
        } else {
          setAppError(result.error);
        }
      }
    });
  }

  function handleResetWithOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setAppError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await resetPasswordWithOtp(formData);
      if (!result.ok) {
        if (result.error.field) {
          setFieldErrors({ [result.error.field]: result.error.message });
        } else {
          setAppError(result.error);
        }
      }
    });
  }

  if (step === "enter_code") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-ink-primary">
              Enter your code
            </CardTitle>
            <CardDescription>
              A 6-character code was sent to{" "}
              <span className="font-medium text-ink-primary">{sentEmail}</span>.
              It expires in 1 hour.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetWithOtp} noValidate>
              <input type="hidden" name="email" value={sentEmail} />
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="otp"
                    className="text-xs font-bold text-ink-primary"
                  >
                    Code from email
                  </Label>
                  <Input
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    required
                    className="min-h-[44px] tracking-widest"
                  />
                  {fieldErrors.otp && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.otp}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="password"
                    className="text-xs font-bold text-ink-primary"
                  >
                    New password
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
                    Confirm new password
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
                  disabled={isPending}
                >
                  {isPending ? "Saving…" : "Reset password"}
                </Button>
              </div>

              <div className="mt-4 text-center text-sm text-ink-secondary">
                Didn&apos;t receive a code?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setStep("request");
                    setFieldErrors({});
                    setAppError(null);
                  }}
                  className="font-medium text-ink-primary underline underline-offset-4"
                >
                  Send again
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-ink-primary">
            Reset password
          </CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a reset code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRequestCode} noValidate>
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

              {appError && (
                <p className="text-sm text-destructive">{appError.message}</p>
              )}

              <Button
                type="submit"
                className="hover:bg-brand-accent-strong/90 min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
                disabled={isPending}
              >
                {isPending ? "Sending…" : "Send code"}
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
    </div>
  );
}
