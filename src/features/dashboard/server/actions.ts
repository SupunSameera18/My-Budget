"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";
import type { DashboardProfile } from "@/features/dashboard/checklist";
import {
  currentMonthBoundaries,
  currentMonthStart,
  currentMonthEnd,
} from "@/lib/period";
import { computeBreathingRoom } from "@/lib/money/breathing-room";
import { getBudgets } from "@/features/budgets/server/actions";

export type BreathingRoomData = {
  breathingRoomMinor: number;
  committedSlackMinor: number;
  currency: string;
  hasActivity: boolean;
};

export type LoggingGridData = {
  datesWithActivity: string[];
  todayStr: string;
  daysInMonth: number;
  monthYear: string;
  firstWeekdayOffset: number;
};

export async function getDashboardProfile(): Promise<Result<DashboardProfile>> {
  try {
    const auth = await requireUser();
    if (!auth) return err(ErrorCode.ProfileFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, checklist_completed_at")
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return err(ErrorCode.ProfileFetchFailed, "Failed to load profile");
    }

    return ok(data as DashboardProfile);
  } catch {
    return err(
      ErrorCode.ProfileFetchFailed,
      "An unexpected error occurred. Please try again.",
    );
  }
}

export async function markChecklistComplete(): Promise<void> {
  try {
    const auth = await requireUser();
    if (!auth) return;
    const { supabase, user } = auth;

    const { error, count } = await supabase
      .from("profiles")
      .update(
        { checklist_completed_at: new Date().toISOString() },
        { count: "exact" },
      )
      .eq("user_id", user.id)
      .is("checklist_completed_at", null);

    if (error) return;
    if (!count || count === 0) return;

    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (posthogKey) {
      const posthogHost =
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
      await fetch(`${posthogHost}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: posthogKey,
          event: "checklist_completed",
          distinct_id: user.id,
          properties: { user_id: user.id, surface: "dashboard" },
        }),
      }).catch(() => {
        // Analytics failure is non-fatal — never block the user path
      });
    }

    revalidatePath("/dashboard");
  } catch {
    // Dismiss is non-fatal — do not surface errors to the user
  }
}

export async function getBreathingRoomData(): Promise<
  Result<BreathingRoomData>
> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.BreathingRoomFetchFailed, "Not authenticated");
    const { supabase, user } = auth;

    const { start, end } = currentMonthBoundaries();

    const [txnsRes, budgetsResult, profileRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("amount_minor, type")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .gte("date", start)
        .lte("date", end),
      getBudgets(),
      supabase
        .from("profiles")
        .select("currency")
        .eq("user_id", user.id)
        .single(),
    ]);

    if (txnsRes.error)
      return err(
        ErrorCode.BreathingRoomFetchFailed,
        "Failed to load transactions.",
      );

    const txns = txnsRes.data ?? [];
    const incomeSumMinor = txns
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount_minor, 0);
    const expenseSumMinor = txns
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount_minor, 0);

    const activeBudgets = budgetsResult.ok
      ? budgetsResult.data.map((b) => ({
          limitMinor: b.limit_minor,
          actualMinor: b.actual_minor,
        }))
      : [];

    const { breathingRoomMinor, committedSlackMinor } = computeBreathingRoom(
      incomeSumMinor,
      expenseSumMinor,
      activeBudgets,
    );

    const currency = profileRes.data?.currency ?? "USD";
    const hasActivity =
      incomeSumMinor > 0 || expenseSumMinor > 0 || activeBudgets.length > 0;

    return ok({
      breathingRoomMinor,
      committedSlackMinor,
      currency,
      hasActivity,
    });
  } catch {
    return err(
      ErrorCode.BreathingRoomFetchFailed,
      "Failed to load breathing room.",
    );
  }
}

export async function getLoggingGridData(): Promise<Result<LoggingGridData>> {
  try {
    const auth = await requireUser();
    if (!auth)
      return err(ErrorCode.LoggingGridFetchFailed, "Not authenticated.");
    const { supabase, user } = auth;

    const now = new Date();
    const start = currentMonthStart(now);
    const end = currentMonthEnd(now);

    const { data, error } = await supabase
      .from("transactions")
      .select("date")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .gte("date", start)
      .lte("date", end);

    if (error)
      return err(
        ErrorCode.LoggingGridFetchFailed,
        "Failed to load logging grid.",
      );

    const datesWithActivity = [...new Set((data ?? []).map((r) => r.date))];

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-indexed
    const monthStr = String(month + 1).padStart(2, "0");
    const monthYear = `${year}-${monthStr}`;
    const todayStr = `${year}-${monthStr}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDayDate = new Date(`${year}-${monthStr}-01T00:00:00Z`);
    const firstWeekdayOffset = (firstDayDate.getUTCDay() + 6) % 7; // Mon=0, Sun=6

    return ok({
      datesWithActivity,
      todayStr,
      daysInMonth,
      monthYear,
      firstWeekdayOffset,
    });
  } catch {
    return err(
      ErrorCode.LoggingGridFetchFailed,
      "Failed to load logging grid.",
    );
  }
}
