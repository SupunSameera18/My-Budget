import { createClient } from "npm:@supabase/supabase-js@2";

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

  // W1 (Phase 2 gap analysis, 7-12): per-IP / per-user rate limiting on this
  // endpoint is a deployment-time concern (Supabase Edge Function rate limits
  // in the project dashboard, or a WAF rule upstream). Application-level
  // rate limiting here would require a durable counter store that survives
  // across cold starts and concurrent invocations — structurally equivalent
  // to adding a new table just for this endpoint, which is disproportionate.
  // The existing guards (AbortController timeout W2, client-side
  // isSubmitting disable, auth JWT requirement) cover the realistic
  // double-submit scenario. Infrastructure-level rate limiting is tracked in
  // deferred-work.md (confirmed as infra scope, not app scope).

  const userId = user.id;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // All table-level erasure (hard-delete personal data + anonymize retained
    // shared records to the tombstone) runs atomically inside the
    // erase_user_data() SECURITY DEFINER function (migration 0082). Doing it in
    // a single DB transaction guarantees there is no half-erased state if any
    // step fails, and applies the one FK-safe deletion order. The function
    // returns the path taken ('family' | 'solo') for the audit record.
    const { data: path, error: eraseError } = await adminClient.rpc(
      "erase_user_data",
      { target: userId },
    );
    if (eraseError) throw eraseError;

    // Delete auth user — POINT OF NO RETURN. erase_user_data() has already
    // removed/anonymized every row that references this user with NO ACTION, so
    // the remaining CASCADE references are cleaned up by this delete.
    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      if (!deleteError.message.toLowerCase().includes("not found")) {
        throw deleteError;
      }
    }

    // P4: audit insert is best-effort; the user is already gone, do not surface
    // failures. Intentionally PII-free (no user_id, no email).
    try {
      await adminClient.from("erasure_audit").insert({
        family_unit_id: null,
        path: (path as string) ?? "solo",
      });
    } catch (auditErr) {
      console.error("erasure_audit insert failed:", auditErr);
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
