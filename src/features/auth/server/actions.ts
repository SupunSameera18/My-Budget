"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  signInSchema,
  signUpSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from "@/features/auth/schema";

export async function signIn(formData: FormData): Promise<Result<void>> {
  const raw = Object.fromEntries(formData);
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (!first) return err(ErrorCode.SignInFailed, "Invalid email or password");
    return err(
      ErrorCode.SignInFailed,
      first.message,
      String(first.path[0] ?? ""),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // SECURITY: never reveal whether the email exists in the system
    return err(ErrorCode.SignInFailed, "Invalid email or password");
  }

  redirect("/");
}

export async function signUp(formData: FormData): Promise<Result<void>> {
  const raw = Object.fromEntries(formData);
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (!first)
      return err(ErrorCode.SignUpFailed, "Sign up failed. Please try again.");
    return err(
      ErrorCode.SignUpFailed,
      first.message,
      String(first.path[0] ?? ""),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const isDuplicate =
      error.message?.toLowerCase().includes("already registered") ||
      (error as { code?: string }).code === "user_already_exists";
    if (isDuplicate) {
      return err(ErrorCode.SignUpFailed, "Email already in use", "email");
    }
    return err(ErrorCode.SignUpFailed, "Sign up failed. Please try again.");
  }

  if (!data.user) {
    return err(ErrorCode.SignUpFailed, "Sign up failed. Please try again.");
  }

  // Supabase "identity protection": duplicate email with confirmation enabled
  // returns a fake user with empty identities instead of an error
  if (
    data.user &&
    (!data.user.identities || data.user.identities.length === 0)
  ) {
    return err(ErrorCode.SignUpFailed, "Email already in use", "email");
  }

  // If session exists, email confirmation is disabled — go straight to app
  if (data.session) {
    redirect("/");
  }
  redirect("/auth/sign-up-success");
}

export async function resetPassword(formData: FormData): Promise<Result<void>> {
  const raw = Object.fromEntries(formData);
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (!first) return err(ErrorCode.PasswordResetFailed, "Invalid request.");
    return err(
      ErrorCode.PasswordResetFailed,
      first.message,
      String(first.path[0] ?? ""),
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) {
    return err(
      ErrorCode.PasswordResetFailed,
      "Password reset is temporarily unavailable.",
    );
  }

  const supabase = await createClient();
  // Error return intentionally not surfaced to caller — never reveal whether email exists
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/auth/update-password`,
  });

  return ok();
}

export async function updatePassword(
  formData: FormData,
): Promise<Result<void>> {
  const raw = Object.fromEntries(formData);
  const parsed = updatePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (!first) return err(ErrorCode.UpdatePasswordFailed, "Invalid request.");
    return err(
      ErrorCode.UpdatePasswordFailed,
      first.message,
      String(first.path[0] ?? ""),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();
  if (getUserError || !user) {
    return err(
      ErrorCode.UpdatePasswordFailed,
      "Session expired. Please request a new password reset link.",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return err(
      ErrorCode.UpdatePasswordFailed,
      "Failed to update password. Please try again.",
    );
  }

  redirect("/");
}

export async function signInWithGoogle(): Promise<Result<{ url: string }>> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) {
    return err(ErrorCode.OAuthFailed, "OAuth is temporarily unavailable.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error || !data.url) {
    return err(ErrorCode.OAuthFailed, "Failed to initiate Google sign-in.");
  }

  return ok({ url: data.url });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error("[signOut] Supabase signOut failed:", e);
  }
  redirect("/auth/login");
}
