import Link from "next/link";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  heading: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}

export function EmptyState({
  heading,
  body,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <p className="mb-2 text-lg font-semibold text-ink-primary">{heading}</p>
      <p className="mb-8 max-w-xs text-sm text-ink-secondary">{body}</p>
      <Link
        href={actionHref}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-brand-accent-strong px-5 py-3 text-sm font-bold text-brand-on-accent hover:opacity-90 active:opacity-80"
      >
        <Plus strokeWidth={2} className="h-4 w-4" />
        {actionLabel}
      </Link>
    </div>
  );
}
