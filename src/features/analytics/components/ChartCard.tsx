import React from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import type { Scope } from "@/features/analytics/schema";

interface ChartCardProps {
  title: string;
  children?: React.ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  scope?: Scope;
}

export function ChartCard({
  title,
  children,
  isEmpty = false,
  emptyMessage = "No data for this period",
  scope,
}: ChartCardProps) {
  const scopeSuffix =
    scope && scope !== "combined"
      ? scope === "personal"
        ? "Personal"
        : "Shared"
      : null;

  return (
    <section
      aria-label={`${title} chart`}
      className="rounded-lg border border-hairline bg-card p-4 shadow-sm"
    >
      <p className="mb-3 text-sm font-semibold text-ink-primary">
        {title}
        {scopeSuffix && (
          <span
            aria-label={`scope: ${scopeSuffix}`}
            className="ml-1 text-xs font-normal text-ink-secondary"
          >
            ({scopeSuffix})
          </span>
        )}
      </p>
      {isEmpty ? <EmptyState heading={emptyMessage} body="" /> : children}
    </section>
  );
}
