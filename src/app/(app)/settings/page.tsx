import Link from "next/link";
import { DownloadDataButton } from "@/features/settings/components/DownloadDataButton";

export default function SettingsPage() {
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
