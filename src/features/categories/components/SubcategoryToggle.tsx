"use client";

import { useState, useTransition } from "react";
import { toggleSubcategories } from "@/features/categories/server/actions";

interface SubcategoryToggleProps {
  enabled: boolean;
}

export function SubcategoryToggle({ enabled }: SubcategoryToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await toggleSubcategories(!enabled);
      if (!result.ok) {
        setError(result.error.message);
      }
    });
  }

  return (
    <section className="mb-6 rounded-lg bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink-primary">
            Subcategories
          </p>
          <p className="text-xs text-ink-secondary">
            Add one level of detail under each category.
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleToggle}
          className="min-h-[44px] min-w-[64px] rounded-md border border-input px-3 text-sm font-semibold text-ink-primary hover:bg-surface-inset disabled:opacity-50"
        >
          {isPending ? "…" : enabled ? "On" : "Off"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
