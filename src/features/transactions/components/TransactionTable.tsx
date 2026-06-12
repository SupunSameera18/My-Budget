"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/feedback/EmptyState";
import { SharedBadge } from "@/features/family/components/SharedBadge";
import { useFamilyRealtime } from "@/features/family/hooks/useFamilyRealtime";
import { formatMoney } from "@/lib/format";
import type { TransactionListItem } from "@/features/transactions/schema";

interface TransactionTableProps {
  items: TransactionListItem[];
  currency: string;
  isFamilyMode?: boolean;
  familyUnitId?: string | null;
}

export function TransactionTable({
  items,
  currency,
  isFamilyMode = false,
  familyUnitId = null,
}: TransactionTableProps) {
  const router = useRouter();
  const { lastEventAt } = useFamilyRealtime(isFamilyMode ? familyUnitId : null);

  // Suppress live announcement for Realtime-driven re-renders (AC 16).
  // User-initiated changes announce normally; Realtime cache invalidations are silent.
  const [suppressLiveAnnouncement, setSuppressLiveAnnouncement] =
    useState(false);

  useEffect(() => {
    if (lastEventAt === 0) return;
    setSuppressLiveAnnouncement(true);
    router.refresh();
    const timer = setTimeout(() => setSuppressLiveAnnouncement(false), 5000);
    return () => clearTimeout(timer);
  }, [lastEventAt, router]);

  const liveText =
    items.length === 0
      ? "No transactions found"
      : `${items.length} transaction${items.length === 1 ? "" : "s"} found`;

  return (
    <>
      {/* ARIA live region — always present from initial render (§9) */}
      <p role="status" aria-live="polite" className="sr-only">
        {suppressLiveAnnouncement ? "" : liveText}
      </p>

      {items.length === 0 ? (
        <EmptyState
          heading="No transactions found"
          body="Try adjusting your filters or log a new transaction."
        />
      ) : (
        <>
          {/* Desktop table — md+ */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs font-medium text-ink-secondary">
                  <th className="py-3 pl-4 pr-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Account</th>
                  <th className="px-3 py-3 font-medium">Note</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="py-3 pl-3 pr-4 text-right font-medium [font-variant-numeric:tabular-nums]">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-surface-muted relative cursor-pointer"
                    onClick={() => router.push(`/transactions/${item.id}`)}
                  >
                    <td className="py-3 pl-4 pr-3 text-ink-secondary">
                      {/* Invisible Link for a11y: keyboard navigation + right-click — inset-0 relative to <tr> */}
                      <Link
                        href={`/transactions/${item.id}`}
                        className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-accent-strong"
                        aria-label={`Edit ${item.category_name} transaction on ${item.date}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {item.date}
                    </td>
                    <td className="px-3 py-3 font-medium text-ink-primary">
                      {item.category_name}
                    </td>
                    <td className="px-3 py-3 text-ink-secondary">
                      {item.account_name}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-3 text-ink-secondary">
                      {item.note ?? ""}
                    </td>
                    <td className="px-3 py-3 capitalize text-ink-secondary">
                      <span className="flex items-center gap-1.5">
                        {item.type}
                        <SharedBadge
                          isFamilyMode={isFamilyMode}
                          isShared={item.is_shared}
                        />
                      </span>
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right font-semibold [font-variant-numeric:tabular-nums]">
                      <span
                        className={
                          item.type === "income"
                            ? "text-green-700 dark:text-green-400"
                            : "text-ink-primary"
                        }
                      >
                        {item.type === "income" ? "+" : "−"}
                        {formatMoney(item.amount_minor, currency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile rows — below md */}
          <ul className="space-y-2 md:hidden">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/transactions/${item.id}`}
                  className="hover:bg-surface-muted flex items-center gap-3 rounded-md bg-surface-base px-4 py-3"
                >
                  {/* Shared badge position (hidden via null return when not applicable) */}
                  <SharedBadge
                    isFamilyMode={isFamilyMode}
                    isShared={item.is_shared}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-primary">
                      {item.category_name}
                    </p>
                    <p className="text-sm text-ink-secondary">
                      {item.date}
                      {item.account_name ? ` · ${item.account_name}` : ""}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 text-sm font-semibold [font-variant-numeric:tabular-nums]",
                      item.type === "income"
                        ? "text-green-700 dark:text-green-400"
                        : "text-ink-primary",
                    ].join(" ")}
                  >
                    {item.type === "income" ? "+" : "−"}
                    {formatMoney(item.amount_minor, currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
