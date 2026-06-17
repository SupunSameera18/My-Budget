import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/require-user";

export const metadata: Metadata = { title: "More" };
import { signOut } from "@/features/auth/server/actions";
import {
  BarChart2,
  Bell,
  CalendarDays,
  LogOut,
  Settings,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function MorePage() {
  const auth = await requireUser();

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">More</h1>

      {auth?.user.email && (
        <p className="mb-6 text-sm text-ink-secondary">
          Signed in as{" "}
          <span className="font-medium text-ink-primary">
            {auth?.user.email}
          </span>
        </p>
      )}

      <div className="mb-2">
        <ThemeToggle />
      </div>

      <div className="mb-2">
        <Link
          href="/notifications"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-md border border-hairline bg-surface-raised px-4 text-sm text-ink-primary transition-colors hover:bg-surface-inset"
        >
          <Bell
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-ink-secondary"
          />
          Notifications
        </Link>
      </div>

      <div className="mb-2">
        <Link
          href="/goals"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-md border border-hairline bg-surface-raised px-4 text-sm text-ink-primary transition-colors hover:bg-surface-inset"
        >
          <Target
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-ink-secondary"
          />
          Goals
        </Link>
      </div>

      <div className="mb-2">
        <Link
          href="/analytics"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-md border border-hairline bg-surface-raised px-4 text-sm text-ink-primary transition-colors hover:bg-surface-inset"
        >
          <BarChart2
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-ink-secondary"
          />
          Analytics
        </Link>
      </div>

      <div className="mb-2">
        <Link
          href="/summary"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-md border border-hairline bg-surface-raised px-4 text-sm text-ink-primary transition-colors hover:bg-surface-inset"
        >
          <CalendarDays
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-ink-secondary"
          />
          Monthly Summary
        </Link>
      </div>

      <div className="mb-2">
        <Link
          href="/family"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-md border border-hairline bg-surface-raised px-4 text-sm text-ink-primary transition-colors hover:bg-surface-inset"
        >
          <Users
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-ink-secondary"
          />
          Family
        </Link>
      </div>

      <div className="mb-2">
        <Link
          href="/settings"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-md border border-hairline bg-surface-raised px-4 text-sm text-ink-primary transition-colors hover:bg-surface-inset"
        >
          <Settings
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-ink-secondary"
          />
          Settings
        </Link>
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
