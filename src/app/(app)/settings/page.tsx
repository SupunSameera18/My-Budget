import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";
import { redirect } from "next/navigation";
import { DownloadDataButton } from "@/features/settings/components/DownloadDataButton";
import { TransactionDefaultsForm } from "@/features/settings/components/TransactionDefaultsForm";
import type { TransactionDefaults } from "@/features/transactions/schema";

export default async function SettingsPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");
  const { supabase, user } = auth;

  // Fetch family status and transaction defaults (non-fatal; fallback to solo/null)
  const [membershipResult, profileResult] = await Promise.all([
    supabase
      .from("family_members")
      .select("family_unit_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("transaction_defaults")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const isFamilyMode = !!membershipResult.data;
  const transactionDefaults =
    (profileResult.data?.transaction_defaults as TransactionDefaults | null) ??
    null;

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-ink-primary">Settings</h1>
      <nav className="flex flex-col gap-2">
        <Link
          href="/settings/accounts"
          className="flex min-h-[44px] items-center rounded-lg bg-card px-4 text-sm text-ink-primary shadow-sm hover:bg-surface-inset"
        >
          Accounts
        </Link>
        <Link
          href="/settings/categories"
          className="flex min-h-[44px] items-center rounded-lg bg-card px-4 text-sm text-ink-primary shadow-sm hover:bg-surface-inset"
        >
          Categories
        </Link>
        <Link
          href="/settings/macros"
          className="flex min-h-[44px] items-center rounded-lg bg-card px-4 text-sm text-ink-primary shadow-sm hover:bg-surface-inset"
        >
          Macros
        </Link>
        <Link
          href="/settings/analytics"
          className="flex min-h-[44px] items-center rounded-lg bg-card px-4 text-sm text-ink-primary shadow-sm hover:bg-surface-inset"
        >
          Analytics
        </Link>
      </nav>
      <div className="mt-6">
        <TransactionDefaultsForm
          initialDefaults={transactionDefaults}
          isFamilyMode={isFamilyMode}
        />
      </div>
      <section className="mt-6">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Privacy &amp; Data
        </h2>
        <div className="rounded-lg bg-card p-4 shadow-sm">
          <p className="mb-3 text-sm text-ink-secondary">
            Download all your personal data in JSON format.
          </p>
          <DownloadDataButton />
        </div>
      </section>
    </div>
  );
}
