"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface DeleteAccountSectionProps {
  userEmail: string;
}

export function DeleteAccountSection({ userEmail }: DeleteAccountSectionProps) {
  const router = useRouter();
  const [emailInput, setEmailInput] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const alertDialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const dialogWasOpenRef = useRef(false);

  // P3: guard against empty userEmail (OAuth accounts with no email bypass the gate otherwise)
  // W3 (Phase 2 gap analysis, 7-12): the confirmation gate is intentionally
  // case-INsensitive — email addresses are case-insensitive in practice
  // (Supabase Auth itself normalizes the local part to lowercase on
  // sign-up), so a user typing their own email back with different casing
  // is a UX false-negative, not a meaningful security check either way
  // (this gate prevents accidental clicks, not unauthorized access — auth
  // already establishes identity).
  const emailMatches =
    userEmail.length > 0 &&
    emailInput.toLowerCase() === userEmail.toLowerCase();

  // Focus the Cancel button when the alert dialog opens (focus-on-show);
  // restore focus to the trigger button when it closes.
  useEffect(() => {
    if (showConfirm) {
      dialogWasOpenRef.current = true;
      cancelBtnRef.current?.focus();
    } else if (dialogWasOpenRef.current) {
      dialogWasOpenRef.current = false;
      deleteButtonRef.current?.focus();
    }
  }, [showConfirm]);

  // Focus trap for alertdialog (dev-learnings §16)
  useEffect(() => {
    if (!showConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConfirm(false);
        return;
      }
      if (e.key === "Tab" && alertDialogRef.current) {
        const focusable = alertDialogRef.current.querySelectorAll<HTMLElement>(
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
  }, [showConfirm]);

  const handleDeleteAccount = () => {
    setStatusMsg("");
    setErrorMsg("");
    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        if (!jwt) {
          setErrorMsg("Session expired. Please sign in again.");
          return;
        }

        // W2 (Phase 2 gap analysis, 7-12): bound the request so a hung
        // connection (dropped wifi, stalled Edge Function) doesn't leave the
        // user staring at a spinner indefinitely — abort and show a retry
        // message instead. 25s budget: comfortably under typical Edge
        // Function execution caps while leaving room for the erasure's many
        // sequential deletes.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25_000);

        let res!: Response;
        try {
          res = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/erase-account`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${jwt}`,
                "Content-Type": "application/json",
              },
              signal: controller.signal,
            },
          );
        } finally {
          clearTimeout(timeoutId);
        }

        if (res.ok) {
          setStatusMsg("Account deleted.");
          await supabase.auth.signOut(); // P7: sign out before navigation so session is cleared first
          router.replace("/goodbye");
        } else {
          const body = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          setErrorMsg(
            body.message ??
              "Erasure failed. Please try again or contact support.",
          );
          setShowConfirm(false);
        }
      } catch (e) {
        setErrorMsg(
          e instanceof DOMException && e.name === "AbortError"
            ? "The request took too long. Please check your connection and try again."
            : "Erasure failed. Please try again or contact support.",
        );
        setShowConfirm(false);
      }
    });
  };

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="mt-8 border-t border-hairline pt-6"
    >
      {/* ARIA live region — always in DOM (dev-learnings §9: hide content not component) */}
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>

      <h2
        id="delete-account-heading"
        className="mb-1 text-sm font-semibold text-destructive"
      >
        Delete Account
      </h2>
      <p className="mb-4 text-sm text-ink-secondary">
        Permanently erase your account and all personal data. This cannot be
        undone.
      </p>

      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <label
          htmlFor="email-confirm"
          className="mb-1 block text-sm font-medium text-ink-primary"
        >
          Type your email address to confirm
        </label>
        <input
          id="email-confirm"
          type="email"
          value={emailInput}
          onChange={(e) => {
            setEmailInput(e.target.value);
            setErrorMsg("");
          }}
          placeholder="Type your email address to confirm"
          aria-label="Confirm your email address to enable account deletion"
          aria-required="true"
          aria-invalid={
            emailInput.length > 0 && !emailMatches ? "true" : undefined
          }
          aria-describedby={
            emailInput.length > 0 && !emailMatches
              ? "email-mismatch"
              : undefined
          }
          className="mb-2 w-full rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-destructive"
          disabled={isPending}
        />
        {emailInput.length > 0 && !emailMatches && (
          <p
            id="email-mismatch"
            role="alert"
            className="mb-2 text-xs text-destructive"
          >
            Email does not match your account email.
          </p>
        )}

        <button
          ref={deleteButtonRef}
          type="button"
          onClick={() => {
            if (!emailMatches) return;
            setErrorMsg("");
            setStatusMsg("");
            setShowConfirm(true);
          }}
          aria-disabled={!emailMatches ? "true" : undefined}
          aria-label="Delete Account"
          style={{ pointerEvents: emailMatches ? "auto" : "none" }}
          className={`min-h-[44px] w-full rounded-md px-4 py-2 text-sm font-semibold transition-opacity ${
            emailMatches
              ? "bg-destructive text-white hover:opacity-90 active:opacity-80"
              : "cursor-not-allowed bg-destructive/40 text-white/60"
          }`}
        >
          Delete Account
        </button>

        {errorMsg && (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-2 text-xs text-destructive"
          >
            {errorMsg}
          </p>
        )}
      </div>

      {/* Inline alertdialog — always mounted, hidden when not active (dev-learnings §9) */}
      <div
        ref={alertDialogRef}
        role="alertdialog"
        aria-labelledby="confirm-dialog-heading"
        aria-modal="true"
        hidden={!showConfirm || undefined}
        className={`${showConfirm ? "flex" : ""} fixed inset-0 z-50 items-center justify-center bg-black/40 p-4`}
      >
        <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-lg">
          <p
            id="confirm-dialog-heading"
            className="mb-2 text-base font-bold text-destructive"
          >
            This is permanent.
          </p>
          <p className="mb-6 text-sm text-ink-secondary">
            Your personal data will be erased. Shared transactions will be
            retained as &apos;Former member&apos; contributions.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={isPending}
              aria-disabled={isPending ? "true" : undefined}
              className="min-h-[44px] w-full rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending ? "Deleting…" : "Delete my account permanently"}
            </button>
            <button
              ref={cancelBtnRef}
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isPending}
              aria-disabled={isPending ? "true" : undefined}
              className="min-h-[44px] w-full rounded-md border border-hairline bg-surface-base px-4 py-2 text-sm text-ink-secondary disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
