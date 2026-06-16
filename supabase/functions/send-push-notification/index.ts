import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Auth guard: this function processes ALL users' pending notifications in
  // bulk, so it must be service-role-only — never reachable with the public
  // anon key (which is itself a valid JWT and would otherwise pass a bare
  // "header present" check).
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response("Unauthorized", {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find undelivered notifications for users who have push subscriptions.
    // Limit to 50 per invocation to stay within Edge Function CPU limits.
    const { data: pendingNotifications, error } = await adminClient
      .from("notifications")
      .select("id, user_id, type, title, body, link, push_notified_at")
      .is("push_notified_at", null)
      .is("dismissed_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw error;
    if (!pendingNotifications || pendingNotifications.length === 0) {
      return new Response(JSON.stringify({ delivered: 0 }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let delivered = 0;

    for (const notification of pendingNotifications) {
      // Get all push subscriptions for this user.
      const { data: subscriptions, error: subsError } = await adminClient
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", notification.user_id);

      if (subsError) {
        // Transient query failure — do NOT mark as notified; leave
        // push_notified_at null so this notification is retried next run.
        console.error("push_subscriptions lookup failed:", subsError);
        continue;
      }

      if (!subscriptions || subscriptions.length === 0) {
        // No push subscription — mark as notified (won't get push, has inbox).
        const { error: markError } = await adminClient
          .from("notifications")
          .update({ push_notified_at: new Date().toISOString() })
          .eq("id", notification.id);
        if (markError) {
          console.error("failed to mark notification as notified:", markError);
        }
        continue;
      }

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        url: notification.link ?? "/notifications",
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          delivered++;
        } catch (pushError: unknown) {
          // 410 Gone = subscription expired; remove it.
          if (
            typeof pushError === "object" &&
            pushError !== null &&
            "statusCode" in pushError &&
            (pushError as { statusCode: number }).statusCode === 410
          ) {
            await adminClient
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          } else {
            // Other errors: log and continue — don't fail the whole batch.
            console.error("web-push send failed:", pushError);
          }
        }
      }

      // Mark notification as push-delivered.
      const { error: deliveredError } = await adminClient
        .from("notifications")
        .update({ push_notified_at: new Date().toISOString() })
        .eq("id", notification.id);
      if (deliveredError) {
        // If this fails after a successful send, the notification will be
        // resent next run — log loudly so it's visible, but don't fail the batch.
        console.error(
          "failed to mark notification as push-delivered (risk of duplicate resend):",
          deliveredError,
        );
      }
    }

    return new Response(JSON.stringify({ delivered }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response("Internal Server Error", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
