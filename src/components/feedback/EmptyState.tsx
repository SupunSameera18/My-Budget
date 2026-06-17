import { useId } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  heading: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  headingLevel?: 2 | 3 | 4;
}

export function EmptyState({
  heading,
  body,
  actionLabel,
  actionHref,
  headingLevel = 2,
}: EmptyStateProps) {
  const uid = useId();
  const slug =
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "empty";
  const headingId = `empty-state-${slug}-${uid.replace(/[^a-z0-9]/g, "")}`;

  const HeadingTag = `h${headingLevel}` as "h2" | "h3" | "h4";

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col items-center justify-center px-4 py-16 text-center"
    >
      <HeadingTag
        id={headingId}
        className="mb-2 text-lg font-semibold text-ink-primary"
      >
        {heading}
      </HeadingTag>
      {body && (
        <p
          className={`max-w-xs text-sm text-ink-secondary ${actionLabel && actionHref ? "mb-8" : ""}`}
        >
          {body}
        </p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-brand-accent-strong px-5 py-3 text-sm font-bold text-brand-on-accent hover:opacity-90 active:opacity-80"
        >
          <Plus strokeWidth={2} className="h-4 w-4" />
          {actionLabel}
        </Link>
      )}
    </section>
  );
}
