"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import type { Scope } from "@/features/analytics/schema";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "combined", label: "Combined" },
  { value: "personal", label: "Personal" },
  { value: "shared", label: "Shared" },
];

interface ScopeSegmentedControlProps {
  isFamilyMode: boolean;
  /** Base path used to build the replacement URL (e.g. "/summary") */
  basePath: string;
}

export function ScopeSegmentedControl({
  isFamilyMode,
  basePath,
}: ScopeSegmentedControlProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [announcement, setAnnouncement] = useState("");
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const rawScope = searchParams.get("scope");
  const currentScope: Scope =
    rawScope === "personal" || rawScope === "shared" || rawScope === "combined"
      ? rawScope
      : "combined";

  function buildUrl(newScope: Scope): string {
    const params = new URLSearchParams(searchParams.toString());
    if (newScope === "combined") {
      params.delete("scope");
    } else {
      params.set("scope", newScope);
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  function handleScopeChange(newScope: Scope) {
    flushSync(() => setAnnouncement(""));
    router.replace(buildUrl(newScope));
    setAnnouncement(`Showing ${newScope} transactions.`);
  }

  function handleKeyDown(e: React.KeyboardEvent, currentIndex: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % SCOPE_OPTIONS.length;
      handleScopeChange(SCOPE_OPTIONS[nextIndex].value);
      buttonRefs.current[nextIndex]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex =
        (currentIndex - 1 + SCOPE_OPTIONS.length) % SCOPE_OPTIONS.length;
      handleScopeChange(SCOPE_OPTIONS[prevIndex].value);
      buttonRefs.current[prevIndex]?.focus();
    }
  }

  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
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
                buttonRefs.current[index] = el;
              }}
              role="radio"
              aria-checked={currentScope === option.value}
              tabIndex={currentScope === option.value ? 0 : -1}
              onClick={() => handleScopeChange(option.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
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
    </>
  );
}
