import React from "react";
import { EmptyState } from "@/components/feedback/EmptyState";

interface ChartCardProps {
  title: string;
  children?: React.ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
}

export function ChartCard({
  title,
  children,
  isEmpty = false,
  emptyMessage = "No data for this period",
}: ChartCardProps) {
  return (
    <section
      aria-label={`${title} chart`}
      className="rounded-lg border border-hairline bg-card p-4 shadow-sm"
    >
      <p className="mb-3 text-sm font-semibold text-ink-primary">{title}</p>
      {isEmpty ? <EmptyState heading={emptyMessage} body="" /> : children}
    </section>
  );
}
