import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/BottomNav";
import { Sidebar } from "@/components/nav/Sidebar";
import { getUnreadNotificationCount } from "@/features/notifications/server/actions";

// Memoizes the profile fetch within a single render pass so that any other
// server component in this layout tree that independently calls getUser() +
// profiles does not duplicate this query (1-8 performance deferral).
const getLayoutProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("user_id", userId)
    .single();
  return data;
});

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  const profile = await getLayoutProfile(data.user.id);

  if (!profile?.onboarding_completed_at) {
    redirect("/onboarding");
  }

  // Graceful supplementary — getUnreadNotificationCount() returns 0 on error.
  const unreadCount = await getUnreadNotificationCount();

  return (
    <div data-testid="app-shell" className="flex h-dvh overflow-hidden">
      <Sidebar unreadCount={unreadCount} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] md:pb-0">
          {children}
        </main>
        <BottomNav unreadCount={unreadCount} />
      </div>
    </div>
  );
}
