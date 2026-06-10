import Link from "next/link";

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
      </nav>
    </div>
  );
}
