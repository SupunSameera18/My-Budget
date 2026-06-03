import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { ErrorCode, err, ok, type Result } from "@/lib/errors";

export async function createProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Result<void>> {
  const { error } = await supabase.from("profiles").insert({ user_id: userId });

  if (error) {
    return err(ErrorCode.ProfileCreateFailed, error.message);
  }
  return ok();
}
