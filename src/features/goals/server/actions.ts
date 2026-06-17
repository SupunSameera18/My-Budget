"use server";

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  createGoalSchema,
  contributeGoalSchema,
  editGoalTargetSchema,
  reclassifyGoalSchema,
  type GoalWithProgress,
  type GoalContributionItem,
} from "@/features/goals/schema";

export async function createGoal(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.GoalCreateFailed, "Not authenticated");
    const { supabase } = auth;

    const raw = {
      name: formData.get("name") as string,
      target_amount_display: formData.get("target_amount_display") as string,
      is_shared: (formData.get("is_shared") as string | null) ?? undefined,
    };

    const parsed = createGoalSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return err(
        ErrorCode.GoalCreateFailed,
        first?.message ?? "Invalid data",
        String(first?.path[0] ?? ""),
      );
    }

    const targetMinor = Math.round(
      parseFloat(parsed.data.target_amount_display) * 100,
    );
    if (targetMinor <= 0) {
      return err(
        ErrorCode.GoalCreateFailed,
        "Target amount must be greater than zero",
        "target_amount_display",
      );
    }

    const isShared = parsed.data.is_shared === "true";

    const { data, error } = await supabase.rpc("rpc_create_goal", {
      p_name: parsed.data.name,
      p_target_minor: targetMinor,
      p_is_shared: isShared,
    });

    if (error) {
      return err(ErrorCode.GoalCreateFailed, "Failed to create goal.");
    }
    if (!data) {
      return err(ErrorCode.GoalCreateFailed, "Failed to create goal.");
    }

    revalidatePath("/goals");
    revalidatePath("/dashboard");
    return ok({ id: data as string });
  } catch {
    return err(ErrorCode.GoalCreateFailed, "An unexpected error occurred.");
  }
}

export async function contributeToGoal(formData: FormData): Promise<Result> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.ContributionCreateFailed, "Not authenticated");
    const { supabase } = auth;

    const raw = {
      goal_id: formData.get("goal_id") as string,
      amount_display: formData.get("amount_display") as string,
      date: formData.get("date") as string,
    };

    const parsed = contributeGoalSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return err(
        ErrorCode.ContributionCreateFailed,
        first?.message ?? "Invalid data",
        String(first?.path[0] ?? ""),
      );
    }

    const amountMinor = Math.round(
      parseFloat(parsed.data.amount_display) * 100,
    );
    if (amountMinor <= 0) {
      return err(
        ErrorCode.ContributionCreateFailed,
        "Amount must be greater than zero",
        "amount_display",
      );
    }

    const { error } = await supabase.rpc("rpc_contribute_goal", {
      p_goal_id: parsed.data.goal_id,
      p_amount_minor: amountMinor,
      p_date: parsed.data.date,
    });

    if (error) {
      if (error.code === "P0002") {
        return err(ErrorCode.ContributionCreateFailed, "Goal not found.");
      }
      if (error.code === "P0001") {
        return err(
          ErrorCode.ContributionCreateFailed,
          "You can only contribute to shared goals.",
        );
      }
      return err(
        ErrorCode.ContributionCreateFailed,
        "Failed to record contribution.",
      );
    }

    revalidatePath("/goals");
    revalidatePath("/dashboard");
    return ok();
  } catch {
    return err(
      ErrorCode.ContributionCreateFailed,
      "An unexpected error occurred.",
    );
  }
}

export async function editGoalTarget(formData: FormData): Promise<Result> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.GoalUpdateFailed, "Not authenticated");
    const { supabase, user } = auth;

    const raw = {
      goal_id: formData.get("goal_id") as string,
      target_amount_display: formData.get("target_amount_display") as string,
    };

    const parsed = editGoalTargetSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return err(
        ErrorCode.GoalUpdateFailed,
        first?.message ?? "Invalid data",
        String(first?.path[0] ?? ""),
      );
    }

    const targetMinor = Math.round(
      parseFloat(parsed.data.target_amount_display) * 100,
    );
    if (targetMinor <= 0) {
      return err(
        ErrorCode.GoalUpdateFailed,
        "Target amount must be greater than zero",
        "target_amount_display",
      );
    }

    const { data, error } = await supabase
      .from("goals")
      .update({
        target_minor: targetMinor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.goal_id)
      .eq("user_id", user.id)
      .is("archived_at", null)
      .select("id");

    if (error) {
      return err(ErrorCode.GoalUpdateFailed, "Failed to update goal.");
    }
    if (!data || data.length === 0) {
      return err(
        ErrorCode.GoalUpdateFailed,
        "Goal not found or access denied.",
      );
    }

    revalidatePath("/goals");
    revalidatePath("/dashboard");
    return ok();
  } catch {
    return err(ErrorCode.GoalUpdateFailed, "An unexpected error occurred.");
  }
}

export async function getGoals(): Promise<
  Result<{ goals: GoalWithProgress[]; currency: string; isFamilyMode: boolean }>
> {
  noStore();
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.GoalFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    const [goalsResult, profileResult, memberResult] = await Promise.all([
      supabase
        .from("goals")
        .select(
          "id, user_id, name, target_minor, is_shared, created_at, goal_contributions(amount_minor, date, user_id)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("currency")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("family_members")
        .select("join_date")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (goalsResult.error) {
      return err(ErrorCode.GoalFetchFailed, "Failed to load goals.");
    }

    const currency = profileResult.data?.currency ?? "USD";
    const viewerJoinDate: string | null = memberResult.data?.join_date ?? null;
    const isFamilyMode = !!viewerJoinDate;

    const goals: GoalWithProgress[] = (goalsResult.data ?? []).map((g) => {
      const isOwner = g.user_id === user.id;
      const allContribs = (g.goal_contributions ?? []) as unknown as Array<{
        amount_minor: number;
        date: string;
        user_id: string;
      }>;

      // For Shared Goals: pool only post-join contributions (join-date-forward invariant).
      // RLS already filters partner contributions to post-join; also filter own for
      // identical pooled total between both partners.
      const progressContribs =
        g.is_shared && viewerJoinDate
          ? allContribs.filter((c) => c.date >= viewerJoinDate)
          : allContribs;

      const currentMinor = progressContribs.reduce(
        (sum, c) => sum + c.amount_minor,
        0,
      );
      const pctUsed =
        g.target_minor > 0 ? (currentMinor / g.target_minor) * 100 : 0;
      const remaining_minor = g.target_minor - currentMinor;

      let myContributionMinor: number | undefined;
      let partnerContributionMinor: number | undefined;
      let partnerContributorId: string | undefined;
      if (g.is_shared && viewerJoinDate) {
        myContributionMinor = progressContribs
          .filter((c) => c.user_id === user.id)
          .reduce((sum, c) => sum + c.amount_minor, 0);
        const partnerContribs = progressContribs.filter(
          (c) => c.user_id !== user.id,
        );
        partnerContributionMinor = partnerContribs.reduce(
          (sum, c) => sum + c.amount_minor,
          0,
        );
        partnerContributorId = partnerContribs[0]?.user_id;
      }

      return {
        id: g.id,
        user_id: g.user_id,
        name: g.name,
        target_minor: g.target_minor,
        is_shared: g.is_shared ?? false,
        isOwner,
        currentMinor,
        remaining_minor,
        pctUsed,
        created_at: g.created_at,
        myContributionMinor,
        partnerContributionMinor,
        partnerContributorId,
      };
    });

    return ok({ goals, currency, isFamilyMode });
  } catch (e) {
    console.error("[getGoals] unexpected error:", e);
    return err(ErrorCode.GoalFetchFailed, "Failed to load goals.");
  }
}

export async function getGoalContributions(
  goalId: string,
): Promise<Result<GoalContributionItem[]>> {
  noStore();
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.GoalContributionsFetchFailed, "Not authenticated");
    const { supabase } = auth;

    const { data, error } = await supabase
      .from("goal_contributions")
      .select("id, user_id, goal_id, amount_minor, date, macro_application_id")
      .eq("goal_id", goalId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getGoalContributions] fetch failed:", error.message);
      return err(
        ErrorCode.GoalContributionsFetchFailed,
        "Failed to load contribution history.",
      );
    }

    return ok(
      (data ?? []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        goal_id: row.goal_id,
        amount_minor: row.amount_minor,
        date: row.date,
        macro_application_id: row.macro_application_id ?? null,
      })),
    );
  } catch (e) {
    console.error("[getGoalContributions] unexpected error:", e);
    return err(
      ErrorCode.GoalContributionsFetchFailed,
      "Failed to load contribution history.",
    );
  }
}

export async function deleteGoalContributionSet(
  applicationId: string,
): Promise<Result> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.GoalContributionDeleteFailed, "Not authenticated");
    const { supabase } = auth;

    const { error } = await supabase.rpc("rpc_delete_goal_contribution_set", {
      p_application_id: applicationId,
    });

    if (error) {
      if (error.code === "P0002") {
        return err(
          ErrorCode.GoalContributionDeleteFailed,
          "Contribution set not found or not owned by you.",
        );
      }
      return err(
        ErrorCode.GoalContributionDeleteFailed,
        "Failed to delete contribution.",
      );
    }

    revalidatePath("/goals");
    return ok();
  } catch (e) {
    console.error("[deleteGoalContributionSet] unexpected error:", e);
    return err(
      ErrorCode.GoalContributionDeleteFailed,
      "Failed to delete contribution.",
    );
  }
}

export async function reclassifyGoal(formData: FormData): Promise<Result> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.ReclassifyGoalFailed, "Not authenticated");
    const { supabase } = auth;

    const raw = {
      goal_id: formData.get("goal_id") as string,
      to_shared: formData.get("to_shared") as string,
    };

    const parsed = reclassifyGoalSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return err(
        ErrorCode.ReclassifyGoalFailed,
        first?.message ?? "Invalid data",
      );
    }

    const toShared = parsed.data.to_shared === "true";

    const { error } = await supabase.rpc("rpc_reclassify_goal", {
      p_goal_id: parsed.data.goal_id,
      p_to_shared: toShared,
    });

    if (error) {
      if (error.code === "P0002") {
        return err(
          ErrorCode.ReclassifyGoalFailed,
          "Goal not found or not owned by you.",
        );
      }
      if (error.code === "P0003") {
        return err(
          ErrorCode.ReclassifyGoalFailed,
          "You must be in a family to share a goal.",
        );
      }
      return err(ErrorCode.ReclassifyGoalFailed, "Failed to reclassify goal.");
    }

    revalidatePath("/goals");
    return ok();
  } catch (e) {
    console.error("[reclassifyGoal] unexpected error:", e);
    return err(ErrorCode.ReclassifyGoalFailed, "Failed to reclassify goal.");
  }
}
