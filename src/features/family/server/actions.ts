"use server";

import { redirect } from "next/navigation";
import crypto from "crypto";
import { requireUser } from "@/lib/supabase/require-user";
import { ok, err, ErrorCode } from "@/lib/errors";
import type { Result } from "@/lib/errors";
import type {
  FamilyStatus,
  ContributionEntry,
  ContributionAnalysisData,
} from "@/features/family/schema";

// Returns the current settle-up tally (signed bigint as number) for the family unit.
// Graceful supplementary — returns null on error so the family page still renders.
export async function getSettleTally(
  familyUnitId: string,
): Promise<number | null> {
  const auth = await requireUser();
  if (!auth) return null;
  try {
    const { data, error } = await auth.supabase.rpc("rpc_settle_up", {
      p_family_unit_id: familyUnitId,
    });
    if (error) return null;
    return data as number;
  } catch {
    return null;
  }
}

// Calls rpc_mark_settled to write a settlement watermark for the current period.
export async function markSettled(
  familyUnitId: string,
): Promise<Result<{ settlementId: string }>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const { data, error } = await auth.supabase.rpc("rpc_mark_settled", {
    p_family_unit_id: familyUnitId,
  });

  if (error) return err(ErrorCode.SettleUpFailed, error.message);
  return ok({ settlementId: data as string });
}

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

// Returns the caller's active (non-archived) accounts with their current balance.
// Graceful supplementary — returns null on error so CloseMonthForm still renders.
export async function getUserAccountsForReconciliation(): Promise<Array<{
  id: string;
  name: string;
  balanceMinor: number;
  currency: string;
}> | null> {
  const auth = await requireUser();
  if (!auth) return null;
  try {
    const { data, error } = await auth.supabase
      .from("accounts")
      .select("id, name, actual_balance_minor, currency")
      .eq("user_id", auth.user.id)
      .is("archived_at", null)
      .order("name");
    if (error || !data) return null;
    return data.map((a) => ({
      id: a.id,
      name: a.name,
      balanceMinor: a.actual_balance_minor,
      currency: a.currency,
    }));
  } catch {
    return null;
  }
}

// Calls rpc_reconciliation_adjustment for each account with a non-zero delta.
// Fires PostHog `reconciliation_completed` event on success.
export async function closeMonth(
  familyUnitId: string,
  adjustments: Array<{
    accountId: string;
    deltaMinor: number;
    note?: string;
  }>,
): Promise<Result<{ adjustmentCount: number }>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const nonZero = adjustments.filter((a) => a.deltaMinor !== 0);

  for (const adj of nonZero) {
    const { error } = await auth.supabase.rpc("rpc_reconciliation_adjustment", {
      p_family_unit_id: familyUnitId,
      p_account_id: adj.accountId,
      p_delta_minor: adj.deltaMinor,
      p_note: adj.note ?? null,
      p_transaction_id: null,
    });
    if (error) return err(ErrorCode.ReconciliationFailed, error.message);
  }

  // PostHog: reconciliation_completed (non-fatal, feeds SM-5)
  fetch("https://app.posthog.com/capture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      event: "reconciliation_completed",
      distinct_id: auth.user.id,
      properties: {
        adjustment_count: nonZero.length,
      },
    }),
  }).catch(() => {});

  return ok({ adjustmentCount: nonZero.length });
}

export async function getContributionAnalysis(
  periodStart?: string,
  periodEnd?: string,
): Promise<ContributionAnalysisData | null> {
  // Graceful supplementary: return null (not redirect) so callers can fetch in parallel
  const auth = await requireUser();
  if (!auth) return null;

  try {
    const { data: rows, error } = await auth.supabase.rpc(
      "rpc_get_contribution_analysis",
      {
        p_period_start: periodStart ?? null,
        p_period_end: periodEnd ?? null,
      },
    );

    if (error || !rows || rows.length !== 2) return null;

    // Fetch display names by stable UUID (§9 A2: always key by ID)
    const contributorIds = rows.map(
      (r: { contributor_id: string }) => r.contributor_id,
    );
    const { data: profiles } = await auth.supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", contributorIds);

    const nameMap = new Map<string, string>();
    for (const p of profiles ?? []) {
      nameMap.set(p.user_id, p.display_name ?? "Partner");
    }

    // Fetch currency from caller's profile
    const { data: callerProfile } = await auth.supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", auth.user.id)
      .single();

    // Place caller's entry first for consistent "my column on the left" UX
    const sortedRows = [...rows].sort((a, b) =>
      a.contributor_id === auth.user.id
        ? -1
        : b.contributor_id === auth.user.id
          ? 1
          : 0,
    );

    const contributions = sortedRows.map(
      (r): ContributionEntry => ({
        contributorId: r.contributor_id,
        displayName: nameMap.get(r.contributor_id) ?? "Partner",
        totalPaidMinor: r.total_paid_minor,
        transactionCount: r.transaction_count,
        goalContributionMinor: r.goal_contribution_minor,
      }),
    );

    return {
      contributions: contributions as [ContributionEntry, ContributionEntry],
      currency: callerProfile?.currency ?? "USD",
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
    };
  } catch {
    return null;
  }
}
