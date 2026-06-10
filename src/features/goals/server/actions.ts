"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import {
  createGoalSchema,
  contributeGoalSchema,
  editGoalTargetSchema,
  type GoalWithProgress,
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

    const { data, error } = await supabase.rpc("rpc_create_goal", {
      p_name: parsed.data.name,
      p_target_minor: targetMinor,
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
  Result<{ goals: GoalWithProgress[]; currency: string }>
> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.GoalFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    const [goalsResult, profileResult] = await Promise.all([
      supabase
        .from("goals")
        .select(
          "id, name, target_minor, created_at, goal_contributions(amount_minor)",
        )
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("currency")
        .eq("user_id", user.id)
        .single(),
    ]);

    if (goalsResult.error) {
      return err(ErrorCode.GoalFetchFailed, "Failed to load goals.");
    }

    const currency = profileResult.data?.currency ?? "USD";

    const goals: GoalWithProgress[] = (goalsResult.data ?? []).map((g) => {
      const contribs = (g.goal_contributions ?? []) as unknown as Array<{
        amount_minor: number;
      }>;
      const currentMinor = contribs.reduce((sum, c) => sum + c.amount_minor, 0);
      const pctUsed =
        g.target_minor > 0 ? (currentMinor / g.target_minor) * 100 : 0;
      const remaining_minor = g.target_minor - currentMinor;

      return {
        id: g.id,
        name: g.name,
        target_minor: g.target_minor,
        currentMinor,
        remaining_minor,
        pctUsed,
        created_at: g.created_at,
      };
    });

    return ok({ goals, currency });
  } catch {
    return err(ErrorCode.GoalFetchFailed, "Failed to load goals.");
  }
}
