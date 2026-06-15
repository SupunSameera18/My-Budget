"use client";

import { useState } from "react";

interface FamilyStatusBannerProps {
  partnerName: string;
}

export function FamilyStatusBanner({ partnerName }: FamilyStatusBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start justify-between gap-4 rounded-lg border border-hairline bg-card px-4 py-3 text-sm text-ink-primary"
    >
      <p>
        You&apos;re now connected with <strong>{partnerName}</strong>. Shared
        transactions logged today will be visible to both of you.
      </p>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss banner"
        className="shrink-0 text-ink-secondary hover:text-ink-primary"
      >
        ✕
      </button>
    </div>
  );
}
