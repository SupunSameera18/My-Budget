"use server";

import { redirect } from "next/navigation";
import crypto from "crypto";
import { requireUser } from "@/lib/supabase/require-user";
import { ok, err, ErrorCode } from "@/lib/errors";
import type { Result } from "@/lib/errors";
import type { FamilyStatus } from "@/features/family/schema";

export async function generateInviteCode(): Promise<Result<{ code: string }>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const rawCode = crypto.randomBytes(32).toString("hex");
  const codeHash = crypto.createHash("sha256").update(rawCode).digest("hex");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await auth.supabase.rpc("rpc_generate_invite", {
    p_code_hash: codeHash,
    p_expires_at: expiresAt,
  });

  if (error)
    return err(
      ErrorCode.InviteGenerateFailed,
      "Failed to generate invite code",
    );

  // PostHog: invite_generated (non-fatal)
  await fetch("https://app.posthog.com/capture/", {
    method: "POST",
    body: JSON.stringify({
      api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      event: "invite_generated",
      distinct_id: auth.user.id,
    }),
  }).catch(() => {});

  return ok({ code: rawCode });
}

export async function revokeInviteCode(
  inviteId: string,
): Promise<Result<void>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const { error } = await auth.supabase.rpc("rpc_revoke_invite", {
    p_invite_id: inviteId,
  });

  if (error)
    return err(ErrorCode.InviteRevokeFailed, "Failed to revoke invite code");

  return ok();
}

export async function getInvitePreview(
  code: string,
): Promise<Result<{ creatorName: string }>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  const { data: creatorName, error } = await auth.supabase.rpc(
    "rpc_preview_invite",
    {
      p_code_hash: codeHash,
    },
  );

  if (error || !creatorName) {
    return err(ErrorCode.InviteNotFound, "Invite code is invalid or expired");
  }

  return ok({ creatorName: creatorName as string });
}

export async function redeemInviteCode(code: string): Promise<Result<void>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  // PostHog: invite_redemption_attempted (non-fatal)
  await fetch("https://app.posthog.com/capture/", {
    method: "POST",
    body: JSON.stringify({
      api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      event: "invite_redemption_attempted",
      distinct_id: auth.user.id,
    }),
  }).catch(() => {});

  const { error } = await auth.supabase.rpc("rpc_redeem_invite", {
    p_code_hash: codeHash,
  });

  if (error) {
    if (error.code === "P0002")
      return err(
        ErrorCode.InviteNotFound,
        "Invalid, expired, or already used invite code",
      );
    if (error.code === "P0003")
      return err(
        ErrorCode.InviteRateLimitExceeded,
        "Too many failed attempts. Please wait 15 minutes and try again.",
      );
    if (error.code === "23514")
      return err(ErrorCode.FamilyFull, "This family already has 2 members");
    if (error.code === "P0001")
      return err(
        ErrorCode.InviteOwnCode,
        "You cannot redeem your own invite code",
      );
    if (error.code === "P0004")
      return err(ErrorCode.AlreadyInFamily, "You're already in a family");
    return err(ErrorCode.InviteRedeemFailed, "Failed to redeem invite code");
  }

  // PostHog: family_joined (non-fatal)
  await fetch("https://app.posthog.com/capture/", {
    method: "POST",
    body: JSON.stringify({
      api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      event: "family_joined",
      distinct_id: auth.user.id,
    }),
  }).catch(() => {});

  return ok();
}

export async function getFamilyStatus(): Promise<FamilyStatus> {
  const auth = await requireUser();
  if (!auth) return { status: "solo" };

  try {
    const { data, error } = await auth.supabase.rpc("rpc_get_family_status");
    if (error || !data) return { status: "solo" };

    const raw = data as Record<string, unknown>;

    if (raw.status === "in_family") {
      return {
        status: "in_family",
        familyUnitId: raw.family_unit_id as string,
        partner: {
          displayName: (raw.partner_name as string) || "Your partner",
        },
      };
    }

    if (raw.status === "has_invite") {
      return {
        status: "has_invite",
        familyUnitId: raw.family_unit_id as string,
        invite: {
          id: raw.invite_id as string,
          expiresAt: raw.invite_expires_at as string,
          createdAt: raw.invite_created_at as string,
        },
      };
    }

    return { status: "solo" };
  } catch {
    return { status: "solo" };
  }
}
