import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/features/auth/server/actions";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">More</h1>

      {user?.email && (
        <p className="mb-6 text-sm text-ink-secondary">
          Signed in as{" "}
          <span className="font-medium text-ink-primary">{user.email}</span>
        </p>
      )}

      <div className="mb-2">
        <ThemeToggle />
      </div>

      <form action={signOut}>
        <button
          type="submit"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-md border border-hairline bg-surface-raised px-4 text-sm text-ink-primary transition-colors hover:bg-surface-inset"
        >
          <LogOut
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-ink-secondary"
          />
          Sign out
        </button>
      </form>
    </div>
  );
}
