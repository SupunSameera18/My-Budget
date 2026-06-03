"use client";

import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

interface OfflineRetryBannerProps {
  onRetry: () => void;
  disabled?: boolean;
}

export function OfflineRetryBanner({
  onRetry,
  disabled,
}: OfflineRetryBannerProps) {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div role="alert" className="rounded-md bg-breathing-low px-4 py-3">
      <p className="text-sm font-semibold text-breathing-low-text">
        You&apos;re offline — your entry is saved here.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className="mt-1 min-h-[44px] text-sm font-bold text-breathing-low-text underline underline-offset-2 hover:opacity-80 active:opacity-70 disabled:opacity-50"
      >
        Retry?
      </button>
    </div>
  );
}
