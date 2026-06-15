"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import type {
  TransactionListFilterAccount,
  TransactionListFilterCategory,
  TransactionListFilters,
} from "@/features/transactions/schema";
import type { Scope } from "@/features/analytics/schema";

interface TransactionFiltersProps {
  accounts: TransactionListFilterAccount[];
  categories: TransactionListFilterCategory[];
  currentFilters: TransactionListFilters;
  isFamilyMode?: boolean;
}

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "combined", label: "Combined" },
  { value: "personal", label: "Personal" },
  { value: "shared", label: "Shared" },
];

export function TransactionFilters({
  accounts,
  categories,
  currentFilters,
  isFamilyMode = false,
}: TransactionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scopeAnnouncement, setScopeAnnouncement] = useState("");
  const scopeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const rawScope = searchParams.get("scope");
  const currentScope: Scope =
    rawScope === "personal" || rawScope === "shared" || rawScope === "combined"
      ? rawScope
      : "combined";

  function buildUrl(updates: Record<string, string | null>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    return qs ? `/transactions?${qs}` : "/transactions";
  }

  function handleAccountChange(value: string) {
    router.replace(buildUrl({ account: value || null }));
  }

  function handleCategoryChange(value: string) {
    router.replace(buildUrl({ category: value || null }));
  }

  function handleFromChange(value: string) {
    router.replace(buildUrl({ from: value || null }));
  }

  function handleToChange(value: string) {
    router.replace(buildUrl({ to: value || null }));
  }

  function handleShowArchivedAccounts(checked: boolean) {
    router.replace(buildUrl({ showArchivedAccounts: checked ? "1" : null }));
  }

  function handleShowArchivedCategories(checked: boolean) {
    router.replace(buildUrl({ showArchivedCategories: checked ? "1" : null }));
  }

  function handleClearFilters() {
    router.replace("/transactions");
  }

  function handleScopeChange(newScope: Scope) {
    flushSync(() => setScopeAnnouncement(""));
    router.replace(
      buildUrl({ scope: newScope === "combined" ? null : newScope }),
    );
    setScopeAnnouncement(`Showing ${newScope} transactions.`);
  }

  function handleScopeKeyDown(e: React.KeyboardEvent, currentIndex: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % SCOPE_OPTIONS.length;
      handleScopeChange(SCOPE_OPTIONS[nextIndex].value);
      scopeButtonRefs.current[nextIndex]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex =
        (currentIndex - 1 + SCOPE_OPTIONS.length) % SCOPE_OPTIONS.length;
      handleScopeChange(SCOPE_OPTIONS[prevIndex].value);
      scopeButtonRefs.current[prevIndex]?.focus();
    }
  }

  const hasActiveFilters =
    currentFilters.account_id ||
    currentFilters.category_id ||
    currentFilters.from ||
    currentFilters.to ||
    currentFilters.showArchivedAccounts ||
    currentFilters.showArchivedCategories;

  return (
    <div className="mb-4 rounded-md border border-hairline bg-surface-base p-4">
      {/* Scope segmented control — always in DOM; hidden attribute hides from AT when not in family mode */}
      <div aria-live="polite" role="status" className="sr-only">
        {scopeAnnouncement}
      </div>
      <div
        data-scope-wrapper=""
        hidden={!isFamilyMode || undefined}
        className="mb-4"
      >
        <p className="mb-2 text-xs font-medium text-ink-secondary">View</p>
        <div
          role="radiogroup"
          aria-label="View scope"
          className="flex rounded-md border border-hairline"
        >
          {SCOPE_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              ref={(el) => {
                scopeButtonRefs.current[index] = el;
              }}
              role="radio"
              aria-checked={currentScope === option.value}
              tabIndex={currentScope === option.value ? 0 : -1}
              onClick={() => handleScopeChange(option.value)}
              onKeyDown={(e) => handleScopeKeyDown(e, index)}
              className={`min-h-[44px] flex-1 px-3 py-2 text-sm font-medium first:rounded-l-md last:rounded-r-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-strong ${
                currentScope === option.value
                  ? "bg-brand-accent-strong text-white"
                  : "bg-surface-base text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Account filter */}
        <div className="flex min-w-[160px] flex-col gap-1">
          <label
            htmlFor="filter-account"
            className="text-xs font-medium text-ink-secondary"
          >
            Account
          </label>
          <select
            id="filter-account"
            className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-strong"
            value={currentFilters.account_id ?? ""}
            onChange={(e) => handleAccountChange(e.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archived_at ? " (archived)" : ""}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={currentFilters.showArchivedAccounts ?? false}
              onChange={(e) => handleShowArchivedAccounts(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        {/* Category filter */}
        <div className="flex min-w-[160px] flex-col gap-1">
          <label
            htmlFor="filter-category"
            className="text-xs font-medium text-ink-secondary"
          >
            Category
          </label>
          <select
            id="filter-category"
            className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-strong"
            value={currentFilters.category_id ?? ""}
            onChange={(e) => handleCategoryChange(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived_at ? " (archived)" : ""}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={currentFilters.showArchivedCategories ?? false}
              onChange={(e) => handleShowArchivedCategories(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        {/* Date range */}
        <div className="flex min-w-[140px] flex-col gap-1">
          <label
            htmlFor="filter-from"
            className="text-xs font-medium text-ink-secondary"
          >
            From
          </label>
          <input
            id="filter-from"
            type="date"
            className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-strong"
            value={currentFilters.from ?? ""}
            max={currentFilters.to}
            onChange={(e) => handleFromChange(e.target.value)}
          />
        </div>

        <div className="flex min-w-[140px] flex-col gap-1">
          <label
            htmlFor="filter-to"
            className="text-xs font-medium text-ink-secondary"
          >
            To
          </label>
          <input
            id="filter-to"
            type="date"
            className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-strong"
            value={currentFilters.to ?? ""}
            min={currentFilters.from}
            onChange={(e) => handleToChange(e.target.value)}
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <button
              type="button"
              className="min-h-[44px] rounded-md px-3 py-2 text-sm text-ink-secondary underline hover:text-ink-primary"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
