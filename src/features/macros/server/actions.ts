"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/require-user";
import { ok, err, ErrorCode, type Result } from "@/lib/errors";
import {
  createMacroSchema,
  updateMacroSchema,
  type MacroWithTarget,
} from "@/features/macros/schema";

export async function createMacro(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroCreateFailed, "Not authenticated");
  const { supabase, user } = auth;

  const raw = {
    name: formData.get("name"),
    amount_display: formData.get("amount_display"),
    category_id: formData.get("category_id"),
    target_type: formData.get("target_type"),
    account_id: formData.get("account_id") || null,
    goal_id: formData.get("goal_id") || null,
  };

  const parsed = createMacroSchema.safeParse(raw);
  if (!parsed.success) {
    return err(ErrorCode.MacroCreateFailed, parsed.error.issues[0].message);
  }

  const amountMinor = Math.round(parseFloat(parsed.data.amount_display) * 100);
  if (amountMinor <= 0) {
    return err(ErrorCode.MacroCreateFailed, "Amount must be greater than zero");
  }

  const account_id =
    parsed.data.target_type === "account"
      ? (parsed.data.account_id ?? null)
      : null;
  const goal_id =
    parsed.data.target_type === "goal" ? (parsed.data.goal_id ?? null) : null;

  const { data, error } = await supabase
    .from("macros")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      amount_minor: amountMinor,
      category_id: parsed.data.category_id,
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
    category_id: formData.get("category_id"),
    target_type: formData.get("target_type"),
    account_id: formData.get("account_id") || null,
    goal_id: formData.get("goal_id") || null,
  };

  const parsed = updateMacroSchema.safeParse(raw);
  if (!parsed.success) {
    return err(ErrorCode.MacroUpdateFailed, parsed.error.issues[0].message);
  }

  const amountMinor = Math.round(parseFloat(parsed.data.amount_display) * 100);
  if (amountMinor <= 0) {
    return err(ErrorCode.MacroUpdateFailed, "Amount must be greater than zero");
  }

  const account_id =
    parsed.data.target_type === "account"
      ? (parsed.data.account_id ?? null)
      : null;
  const goal_id =
    parsed.data.target_type === "goal" ? (parsed.data.goal_id ?? null) : null;

  const { error } = await supabase
    .from("macros")
    .update({
      name: parsed.data.name,
      amount_minor: amountMinor,
      category_id: parsed.data.category_id,
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

export async function getMacros(): Promise<Result<MacroWithTarget[]>> {
  const auth = await requireUser();
  if (!auth) return err(ErrorCode.MacroFetchFailed, "Not authenticated");
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("macros")
    .select(
      "id, name, amount_minor, last_used_at, archived_at, created_at, account_id, goal_id, category_id, accounts(name), goals(name), categories(name)",
    )
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return err(ErrorCode.MacroFetchFailed, "Failed to fetch macros");
  }

  const macros: MacroWithTarget[] = (data ?? []).map((m) => ({
    id: m.id,
    user_id: user.id,
    name: m.name,
    amount_minor: m.amount_minor,
    account_id: m.account_id,
    goal_id: m.goal_id,
    category_id: m.category_id,
    last_used_at: m.last_used_at,
    archived_at: m.archived_at,
    created_at: m.created_at,
    account_name:
      (m.accounts as unknown as { name: string } | null)?.name ?? null,
    goal_name: (m.goals as unknown as { name: string } | null)?.name ?? null,
    category_name:
      (m.categories as unknown as { name: string } | null)?.name ?? "Unknown",
  }));

  return ok(macros);
}
