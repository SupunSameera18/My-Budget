"use client";

import { useState, useRef, useEffect, useTransition, useId } from "react";
import { useRouter } from "next/navigation";
import {
  getInvitePreview,
  redeemInviteCode,
} from "@/features/family/server/actions";

export function JoinFamilyForm() {
  const headingId = useId();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [confirmedCode, setConfirmedCode] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Focus trap for confirmation dialog (dev-learnings §16 pattern)
  useEffect(() => {
    if (!showConfirmation) return;

    // Move focus into dialog
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled])",
    );
    firstFocusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConfirmation(false);
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"]), [aria-disabled="true"]:not([disabled])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showConfirmation]);

  // Return focus to trigger when dialog closes
  useEffect(() => {
    if (!showConfirmation) {
      triggerRef.current?.focus();
    }
  }, [showConfirmation]);

  function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatusMsg("");
    setErrorMsg("");
    startTransition(async () => {
      setStatusMsg("Checking code…");
      const trimmedCode = code.trim();
      const result = await getInvitePreview(trimmedCode);
      if (!result.ok) {
        setStatusMsg(result.error.message);
        setErrorMsg(result.error.message);
        return;
      }
      setConfirmedCode(trimmedCode);
      setPartnerName(result.data.creatorName);
      setStatusMsg("");
      setShowConfirmation(true);
    });
  }

  function handleConfirm() {
    setStatusMsg("");
    startTransition(async () => {
      setStatusMsg("Joining…");
      const result = await redeemInviteCode(confirmedCode);
      if (!result.ok) {
        setShowConfirmation(false);
        setStatusMsg(result.error.message);
        return;
      }
      setShowConfirmation(false);
      setStatusMsg(`You're now connected with ${partnerName}!`);
      router.refresh();
    });
  }

  return (
    <>
      {/* Always-mounted ARIA live region (§9 enforced check) */}
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>

      <form onSubmit={handleCodeSubmit} noValidate className="flex flex-col gap-3">
        <label
          htmlFor="invite-code-input"
          className="text-sm text-ink-secondary"
        >
          Enter the invite code your partner shared with you
        </label>
        <div className="flex gap-2">
          <input
            id="invite-code-input"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={showConfirmation}
            placeholder="Paste invite code here"
            className="min-h-[44px] flex-1 rounded-lg border border-hairline bg-surface-base px-3 text-sm text-ink-primary placeholder:text-ink-secondary focus:outline-none focus:ring-2 focus:ring-brand-accent disabled:opacity-50"
          />
          <button
            ref={triggerRef}
            type="submit"
            disabled={isPending || !code.trim()}
            aria-disabled={isPending || !code.trim() ? "true" : undefined}
            className="min-h-[44px] rounded-lg bg-brand-accent-strong px-4 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Checking…" : "Join family"}
          </button>
        </div>
        {errorMsg && (
          <p role="alert" className="text-sm text-destructive">
            {errorMsg}
          </p>
        )}
      </form>

      {/* Confirmation dialog — always in DOM; hidden until triggered (AC 6, 16) */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        hidden={!showConfirmation || undefined}
        className={`${showConfirmation ? "flex" : ""} fixed inset-0 z-50 items-center justify-center bg-black/50 p-4`}
      >
        <div className="w-full max-w-sm rounded-xl bg-surface-base p-6 shadow-lg">
          <h2
            id={headingId}
            className="mb-3 text-base font-semibold text-ink-primary"
          >
            Join family account?
          </h2>
          <p className="mb-6 text-sm text-ink-secondary">
            You&apos;re about to join <strong>{partnerName}</strong>&apos;s
            family account. Once joined, this cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              aria-disabled={isPending || undefined}
              className="min-h-[44px] flex-1 rounded-lg bg-brand-accent-strong text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Joining…" : "Join family"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmation(false)}
              disabled={isPending}
              aria-disabled={isPending || undefined}
              className="min-h-[44px] flex-1 rounded-lg border border-hairline text-sm text-ink-secondary hover:bg-surface-inset disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
