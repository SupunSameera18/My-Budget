"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ok, err, ErrorCode, type Result } from "@/lib/errors";
import {
  createMacroSchema,
  updateMacroSchema,
  type MacroWithTarget,
} from "@/features/macros/schema";
import { parseAmountMinor } from "@/lib/money/parse-minor";

export async function createMacro(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroCreateFailed, "Not authenticated");
  const { supabase, user } = auth;

  const raw = {
    name: formData.get("name"),
    amount_display: formData.get("amount_display"),
    category_id: formData.get("category_id") || null,
    target_type: formData.get("target_type"),
    account_id: formData.get("account_id") || null,
    goal_id: formData.get("goal_id") || null,
  };

  const parsed = createMacroSchema.safeParse(raw);
  if (!parsed.success) {
    return err(ErrorCode.MacroCreateFailed, parsed.error.issues[0].message);
  }

  const amountMinor = parseAmountMinor(parsed.data.amount_display);
  if (amountMinor <= 0) {
    return err(ErrorCode.MacroCreateFailed, "Amount must be greater than zero");
  }

  const account_id =
    parsed.data.target_type === "account"
      ? (parsed.data.account_id ?? null)
      : null;
  const goal_id =
    parsed.data.target_type === "goal" ? (parsed.data.goal_id ?? null) : null;
  const category_id =
    parsed.data.target_type === "account"
      ? (parsed.data.category_id ?? null)
      : null;

  const { data, error } = await supabase
    .from("macros")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      amount_minor: amountMinor,
      category_id,
      account_id,
      goal_id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return err(ErrorCode.MacroCreateFailed, "Failed to create macro");
  }

  revalidatePath("/settings/macros");
  return ok({ id: data.id });
}

export async function updateMacro(
  macroId: string,
  formData: FormData,
): Promise<Result> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroUpdateFailed, "Not authenticated");
  const { supabase, user } = auth;

  const raw = {
    macro_id: macroId,
    name: formData.get("name"),
    amount_display: formData.get("amount_display"),
    category_id: formData.get("category_id") || null,
    target_type: formData.get("target_type"),
    account_id: formData.get("account_id") || null,
    goal_id: formData.get("goal_id") || null,
  };

  const parsed = updateMacroSchema.safeParse(raw);
  if (!parsed.success) {
    return err(ErrorCode.MacroUpdateFailed, parsed.error.issues[0].message);
  }

  const amountMinor = parseAmountMinor(parsed.data.amount_display);
  if (amountMinor <= 0) {
    return err(ErrorCode.MacroUpdateFailed, "Amount must be greater than zero");
  }

  const account_id =
    parsed.data.target_type === "account"
      ? (parsed.data.account_id ?? null)
      : null;
  const goal_id =
    parsed.data.target_type === "goal" ? (parsed.data.goal_id ?? null) : null;
  const category_id =
    parsed.data.target_type === "account"
      ? (parsed.data.category_id ?? null)
      : null;

  const { error } = await supabase
    .from("macros")
    .update({
      name: parsed.data.name,
      amount_minor: amountMinor,
      category_id,
      account_id,
      goal_id,
    })
    .eq("id", macroId)
    .eq("user_id", user.id);

  if (error) {
    return err(ErrorCode.MacroUpdateFailed, "Failed to update macro");
  }

  revalidatePath("/settings/macros");
  return ok();
}

export async function archiveMacro(macroId: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroArchiveFailed, "Not authenticated");
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("macros")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", macroId)
    .eq("user_id", user.id)
    .is("archived_at", null);

  if (error) {
    return err(ErrorCode.MacroArchiveFailed, "Failed to archive macro");
  }

  revalidatePath("/settings/macros");
  return ok();
}

export async function unarchiveMacro(macroId: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroUnarchiveFailed, "Not authenticated");
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("macros")
    .update({ archived_at: null })
    .eq("id", macroId)
    .eq("user_id", user.id)
    .not("archived_at", "is", null);

  if (error) {
    return err(ErrorCode.MacroUnarchiveFailed, "Failed to unarchive macro");
  }

  revalidatePath("/settings/macros");
  return ok();
}

export async function deleteMacro(macroId: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroDeleteFailed, "Not authenticated");
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("macros")
    .delete()
    .eq("id", macroId)
    .eq("user_id", user.id)
    .not("archived_at", "is", null);

  if (error) {
    return err(ErrorCode.MacroDeleteFailed, "Failed to delete macro");
  }

  revalidatePath("/settings/macros");
  return ok();
}

export async function applyMacro(
  macroId: string,
  date: string,
): Promise<Result<{ applicationId: string }>> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroApplyFailed, "Not authenticated");
  const { supabase } = auth;

  const { data, error } = await supabase.rpc("rpc_apply_macro", {
    p_macro_id: macroId,
    p_date: date,
  });

  if (error) {
    if (error.code === "P0002") {
      return err(
        ErrorCode.MacroApplyFailed,
        "Macro not found or no longer available.",
      );
    }
    return err(ErrorCode.MacroApplyFailed, "Failed to apply macro.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return ok({ applicationId: data as string });
}

function mapMacroRow(
  m: {
    id: string;
    name: string;
    amount_minor: number;
    last_used_at: string | null;
    archived_at: string | null;
    created_at: string;
    account_id: string | null;
    goal_id: string | null;
    category_id: string | null;
    accounts: unknown;
    goals: unknown;
    categories: unknown;
  },
  userId: string,
): MacroWithTarget {
  return {
    id: m.id,
    user_id: userId,
    name: m.name,
    amount_minor: m.amount_minor,
    account_id: m.account_id,
    goal_id: m.goal_id,
    category_id: m.category_id,
    last_used_at: m.last_used_at,
    archived_at: m.archived_at,
    created_at: m.created_at,
    account_name: (m.accounts as { name: string } | null)?.name ?? null,
    goal_name: (m.goals as { name: string } | null)?.name ?? null,
    category_name: (m.categories as { name: string } | null)?.name ?? null,
  };
}

const MACRO_SELECT =
  "id, name, amount_minor, last_used_at, archived_at, created_at, account_id, goal_id, category_id, accounts(name), goals(name), categories(name)";

export async function getMacros(): Promise<Result<MacroWithTarget[]>> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroFetchFailed, "Not authenticated");
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("macros")
    .select(MACRO_SELECT)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return err(ErrorCode.MacroFetchFailed, "Failed to fetch macros");
  }

  return ok(
    (data ?? []).map((m) =>
      mapMacroRow(m as Parameters<typeof mapMacroRow>[0], user.id),
    ),
  );
}

export async function getArchivedMacros(): Promise<Result<MacroWithTarget[]>> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroFetchFailed, "Not authenticated");
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("macros")
    .select(MACRO_SELECT)
    .eq("user_id", user.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) {
    return err(ErrorCode.MacroFetchFailed, "Failed to fetch archived macros");
  }

  return ok(
    (data ?? []).map((m) =>
      mapMacroRow(m as Parameters<typeof mapMacroRow>[0], user.id),
    ),
  );
}
