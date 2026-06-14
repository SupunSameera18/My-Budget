import { createClient } from "jsr:@supabase/supabase-js@2";

const TOMBSTONE_UUID = "00000000-0000-0000-0000-000000000001";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // P2: Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  const jwt = authHeader.slice(7);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const userId = user.id;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: memberRow, error: memberErr } = await adminClient
      .from("family_members")
      .select("family_unit_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr) throw memberErr;

    const familyUnitId: string | null = memberRow?.family_unit_id ?? null;

    if (familyUnitId) {
      // ── FAMILY PATH ──────────────────────────────────────────────────────────

      // Step 1: Hard-delete Personal data
      const { error: e1 } = await adminClient
        .from("transactions")
        .delete()
        .eq("user_id", userId)
        .eq("is_shared", false);
      if (e1) throw e1;

      const { error: e2 } = await adminClient
        .from("accounts")
        .delete()
        .eq("user_id", userId);
      if (e2) throw e2;

      // P1: Fetch personal goal IDs before deleting, so we can filter contributions correctly
      const { data: personalGoals, error: pgErr } = await adminClient
        .from("goals")
        .select("id")
        .eq("user_id", userId)
        .eq("is_shared", false);
      if (pgErr) throw pgErr;

      // P1: Delete contributions for personal goals before deleting the goals themselves
      if (personalGoals && personalGoals.length > 0) {
        const personalGoalIds = personalGoals.map(
          (g: { id: string }) => g.id,
        );
        const { error: e3 } = await adminClient
          .from("goal_contributions")
          .delete()
          .in("goal_id", personalGoalIds);
        if (e3) throw e3;
      }

      const { error: e4 } = await adminClient
        .from("goals")
        .delete()
        .eq("user_id", userId)
        .eq("is_shared", false);
      if (e4) throw e4;

      const { error: e5 } = await adminClient
        .from("budgets")
        .delete()
        .eq("user_id", userId);
      if (e5) throw e5;

      const { error: e6 } = await adminClient
        .from("macros")
        .delete()
        .eq("user_id", userId);
      if (e6) throw e6;

      const { error: e7 } = await adminClient
        .from("profiles")
        .delete()
        .eq("user_id", userId);
      if (e7) throw e7;

      // P9: categories NOT deleted in family path — they are generic labels ("Groceries",
      // "Rent") rather than personal data, and surviving Shared transactions reference them
      // via a NOT NULL FK. Deleting them would cause a FK violation.

      // Step 2: Anonymize Shared records — replace user_id with tombstone
      const { error: e8 } = await adminClient
        .from("transactions")
        .update({ user_id: TOMBSTONE_UUID, note: null })
        .eq("user_id", userId)
        .eq("is_shared", true);
      if (e8) throw e8;

      const { error: e9 } = await adminClient
        .from("goals")
        .update({ user_id: TOMBSTONE_UUID })
        .eq("user_id", userId)
        .eq("is_shared", true);
      if (e9) throw e9;

      // P1: After personal-goal contributions were deleted in Step 1, only shared-goal
      // contributions remain for this user — anonymize them to tombstone.
      const { error: e10 } = await adminClient
        .from("goal_contributions")
        .update({ user_id: TOMBSTONE_UUID })
        .eq("user_id", userId);
      if (e10) throw e10;

      const { error: e11 } = await adminClient
        .from("activity_trail")
        .update({ user_id: TOMBSTONE_UUID })
        .eq("user_id", userId);
      if (e11) throw e11;

      const { error: e12 } = await adminClient
        .from("transaction_splits")
        .update({ payer_id: TOMBSTONE_UUID })
        .eq("payer_id", userId);
      if (e12) throw e12;

      // Step 3: Dissolve family membership
      const { error: e13 } = await adminClient
        .from("family_members")
        .delete()
        .eq("user_id", userId);
      if (e13) throw e13;

      const { data: remainingMembers, error: rmErr } = await adminClient
        .from("family_members")
        .select("user_id")
        .eq("family_unit_id", familyUnitId);
      if (rmErr) throw rmErr;

      if (!remainingMembers || remainingMembers.length === 0) {
        const { error: e14 } = await adminClient
          .from("family_units")
          .delete()
          .eq("id", familyUnitId);
        if (e14) throw e14;
      }

      // Step 4: Revoke invite codes
      const { error: e15 } = await adminClient
        .from("invite_codes")
        .update({ revoked_at: new Date().toISOString() })
        .eq("creator_id", userId)
        .is("revoked_at", null);
      if (e15) throw e15;

      // Step 5: Delete auth user — POINT OF NO RETURN
      const { error: deleteError } =
        await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        if (!deleteError.message.toLowerCase().includes("not found")) {
          throw deleteError;
        }
      }

      // P4: Step 6 — audit insert is best-effort; user is already gone, do not surface failures
      try {
        await adminClient.from("erasure_audit").insert({
          family_unit_id: familyUnitId,
          path: "family",
        });
      } catch (auditErr) {
        console.error("erasure_audit insert failed (family path):", auditErr);
      }
    } else {
      // ── SOLO PATH ────────────────────────────────────────────────────────────
      const { error: s1 } = await adminClient
        .from("transactions")
        .delete()
        .eq("user_id", userId);
      if (s1) throw s1;

      const { error: s2 } = await adminClient
        .from("accounts")
        .delete()
        .eq("user_id", userId);
      if (s2) throw s2;

      const { error: s3 } = await adminClient
        .from("goals")
        .delete()
        .eq("user_id", userId);
      if (s3) throw s3;

      const { error: s4 } = await adminClient
        .from("goal_contributions")
        .delete()
        .eq("user_id", userId);
      if (s4) throw s4;

      const { error: s5 } = await adminClient
        .from("budgets")
        .delete()
        .eq("user_id", userId);
      if (s5) throw s5;

      const { error: s6 } = await adminClient
        .from("macros")
        .delete()
        .eq("user_id", userId);
      if (s6) throw s6;

      const { error: s7 } = await adminClient
        .from("activity_trail")
        .delete()
        .eq("user_id", userId);
      if (s7) throw s7;

      const { error: s8 } = await adminClient
        .from("profiles")
        .delete()
        .eq("user_id", userId);
      if (s8) throw s8;

      const { error: s9 } = await adminClient
        .from("categories")
        .delete()
        .eq("user_id", userId);
      if (s9) throw s9;

      const { error: s10 } = await adminClient
        .from("invite_codes")
        .update({ revoked_at: new Date().toISOString() })
        .eq("creator_id", userId)
        .is("revoked_at", null);
      if (s10) throw s10;

      // Delete auth user — POINT OF NO RETURN
      const { error: deleteError } =
        await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        if (!deleteError.message.toLowerCase().includes("not found")) {
          throw deleteError;
        }
      }

      // P4: Audit insert is best-effort
      try {
        await adminClient.from("erasure_audit").insert({
          family_unit_id: null,
          path: "solo",
        });
      } catch (auditErr) {
        console.error("erasure_audit insert failed (solo path):", auditErr);
      }
    }

    return new Response(JSON.stringify({ message: "Account erased" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    console.error("erase-account error:", err);
    return new Response(
      JSON.stringify({
        message: "Erasure failed. Please try again or contact support.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  }
});
