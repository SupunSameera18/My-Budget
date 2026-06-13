"use client";

import { useState, useTransition } from "react";
import { updatePrivacyToggle } from "@/features/family/server/actions";

interface PrivacyToggleProps {
  initialValue: boolean;
  isFamilyMode: boolean;
}

export function PrivacyToggle({
  initialValue,
  isFamilyMode,
}: PrivacyToggleProps) {
  const [enabled, setEnabled] = useState(initialValue);
  const [statusMsg, setStatusMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setStatusMsg(""); // reset before action so consecutive failures re-announce
    startTransition(async () => {
      try {
        const result = await updatePrivacyToggle(next);
        if (!result.ok) {
          setEnabled(!next); // revert on error
          setStatusMsg("Failed to update privacy setting. Please try again.");
        }
      } catch {
        setEnabled(!next); // revert on network/unexpected error
        setStatusMsg("Failed to update privacy setting. Please try again.");
      }
    });
  }

  return (
    <>
      {/* aria-live outside hidden container so it pre-registers with screen readers (§9) */}
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>
      <section hidden={!isFamilyMode} aria-labelledby="privacy-toggle-heading">
        <h2
          id="privacy-toggle-heading"
          className="mb-3 text-base font-medium text-ink-primary"
        >
          Privacy
        </h2>
        <label className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg border border-hairline bg-card px-4">
          <span className="text-sm text-ink-primary">
            Hide personal transactions
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={enabled}
            aria-describedby="privacy-toggle-hint"
            checked={enabled}
            onChange={handleToggle}
            disabled={isPending}
            aria-disabled={isPending}
            className="h-4 w-4 accent-[#4FA6A6]"
          />
        </label>
        <p id="privacy-toggle-hint" className="mt-2 text-sm text-ink-secondary">
          When on, neither of you can see each other&apos;s personal
          transactions. You&apos;ll still see your own.
        </p>
      </section>
    </>
  );
}
