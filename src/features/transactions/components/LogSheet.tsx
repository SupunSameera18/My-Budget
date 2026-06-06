"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getSuggestedNotes,
  logTransaction,
} from "@/features/transactions/server/actions";
import { getDefaultNotePrompt } from "@/lib/note-suggestions";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Account } from "@/features/accounts/schema";
import type {
  TransactionCategory,
  Subcategory,
} from "@/features/transactions/schema";
import { ErrorCode, type AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { applyTransactionToBreathingRoom } from "@/lib/money/transaction-preview";
import { NumberPad } from "./NumberPad";

interface LogSheetProps {
  accounts: Account[];
  categories: TransactionCategory[];
  defaultAccountId: string | null;
  currency: string;
  subcategoriesEnabled: boolean;
  subcategories: Subcategory[];
  currentBreathingRoomMinor: number;
}

export function LogSheet({
  accounts,
  categories,
  defaultAccountId,
  currency,
  subcategoriesEnabled,
  subcategories,
  currentBreathingRoomMinor,
}: LogSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [appError, setAppError] = useState<AppError | null>(null);
  const isOnline = useOnlineStatus();

  const [step, setStep] = useState<1 | 2>(1);
  const [amountDisplay, setAmountDisplay] = useState("0");
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccountId ?? accounts[0]?.id ?? "",
  );
  const [selectedDate, setSelectedDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [note, setNote] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const amountMinor =
    amountDisplay === "0" || amountDisplay === "" || amountDisplay === "0."
      ? 0
      : Math.round(parseFloat(amountDisplay) * 100);

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  const selectedCategoryType =
    categories.find((c) => c.id === selectedCategoryId)?.type ?? "expense";

  const availableSubcategories = subcategoriesEnabled
    ? subcategories.filter((s) => s.category_id === selectedCategoryId)
    : [];

  const selectedCategoryName =
    categories.find((c) => c.id === selectedCategoryId)?.name ?? "";
  const notePrompt = getDefaultNotePrompt(selectedCategoryName);

  useEffect(() => {
    setSelectedSubcategoryId("");
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!selectedCategoryId || !isOnline) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    getSuggestedNotes(selectedCategoryId)
      .then((notes) => {
        if (!cancelled) setSuggestions(notes);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, isOnline]);

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("amount_display", amountDisplay);
    fd.set("account_id", selectedAccountId);
    fd.set("category_id", selectedCategoryId);
    fd.set("date", selectedDate);
    if (note.trim()) fd.set("note", note.trim());
    if (selectedSubcategoryId) fd.set("subcategory_id", selectedSubcategoryId);
    return fd;
  }

  function submitForm() {
    setAppError(null);
    startTransition(async () => {
      try {
        const result = await logTransaction(buildFormData());
        if (!result.ok) {
          setAppError(result.error);
        } else {
          router.push("/dashboard?saved=1");
        }
      } catch {
        setAppError({
          code: ErrorCode.TransactionCreateFailed,
          message:
            "Could not save — please check your connection and try again.",
        });
      }
    });
  }

  function handleRetry() {
    submitForm();
  }

  const step1PreviewMinor =
    amountMinor > 0
      ? applyTransactionToBreathingRoom(
          currentBreathingRoomMinor,
          amountMinor,
          "expense",
        )
      : null;

  const step2PreviewMinor =
    amountMinor > 0 && selectedCategoryId
      ? applyTransactionToBreathingRoom(
          currentBreathingRoomMinor,
          amountMinor,
          selectedCategoryType,
        )
      : null;

  if (step === 1) {
    return (
      <div className="flex flex-col gap-4">
        {/* Amount display */}
        <div className="text-center">
          <p
            aria-live="polite"
            className="text-5xl font-bold tabular-nums text-ink-primary"
          >
            <span className="text-2xl text-ink-secondary">{currency} </span>
            {amountDisplay}
          </p>
          {step1PreviewMinor !== null && (
            <p
              role="status"
              aria-live="polite"
              className="mt-1 text-sm text-ink-secondary"
            >
              After saving: {formatMoney(step1PreviewMinor, currency)}
            </p>
          )}
        </div>

        {/* Number pad */}
        <NumberPad value={amountDisplay} onChange={setAmountDisplay} />

        {/* Account + Date chips */}
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-full border border-hairline bg-surface-base px-3 py-1 text-sm text-ink-secondary">
            <label htmlFor="account_chip" className="sr-only">
              Account
            </label>
            <select
              id="account_chip"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-transparent text-sm text-ink-primary outline-none"
              aria-label="Account"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 items-center gap-1 rounded-full border border-hairline bg-surface-base px-3 py-1 text-sm text-ink-secondary">
            <label htmlFor="date_chip" className="sr-only">
              Date
            </label>
            <input
              id="date_chip"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-transparent text-sm text-ink-primary outline-none"
              aria-label="Date"
            />
          </div>
        </div>

        <Button
          type="button"
          disabled={amountMinor === 0}
          onClick={() => setStep(2)}
          className="min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
        >
          Continue
        </Button>
      </div>
    );
  }

  // Step 2
  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setStep(1)}
        className="w-fit"
      >
        ← Back
      </Button>

      {/* Category heading */}
      <h2 className="text-sm font-bold text-ink-primary">Category</h2>

      {/* Expense section */}
      {expenseCategories.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Expense
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {expenseCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={selectedCategoryId === c.id}
                onClick={() => setSelectedCategoryId(c.id)}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selectedCategoryId === c.id
                    ? "bg-brand-accent-strong text-white"
                    : "hover:bg-surface-inset/70 bg-surface-inset text-ink-primary"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Income section */}
      {incomeCategories.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Income
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {incomeCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={selectedCategoryId === c.id}
                onClick={() => setSelectedCategoryId(c.id)}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selectedCategoryId === c.id
                    ? "bg-brand-accent-strong text-white"
                    : "hover:bg-surface-inset/70 bg-surface-inset text-ink-primary"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subcategory picker */}
      {availableSubcategories.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="subcategory_id"
            className="text-xs font-bold text-ink-primary"
          >
            Subcategory{" "}
            <span className="font-normal text-ink-secondary">(optional)</span>
          </label>
          <select
            key={selectedCategoryId}
            id="subcategory_id"
            value={selectedSubcategoryId}
            onChange={(e) => setSelectedSubcategoryId(e.target.value)}
            className="flex h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">None</option>
            {availableSubcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Suggestion chips + ARIA live region */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {suggestions.length > 0
          ? `${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""} available`
          : ""}
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-ink-primary">
            Previous notes{" "}
            <span className="font-normal text-ink-secondary">(tap to use)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNote(s)}
                className="hover:bg-surface-inset/70 min-h-[44px] rounded-lg border border-hairline bg-surface-inset px-3 py-2 text-sm text-ink-primary transition-colors active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-xs font-bold text-ink-primary">
          Note{" "}
          <span className="font-normal text-ink-secondary">(optional)</span>
        </label>
        <Input
          id="note"
          type="text"
          maxLength={280}
          autoComplete="off"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={suggestions.length === 0 ? (notePrompt ?? "") : ""}
          className="min-h-[44px]"
        />
      </div>

      {/* Breathing Room preview in step 2 */}
      {step2PreviewMinor !== null && (
        <p aria-live="polite" className="text-sm text-ink-secondary">
          After saving: {formatMoney(step2PreviewMinor, currency)}
        </p>
      )}

      {/* ARIA live region for save state */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isPending ? "Saving…" : ""}
      </div>

      {/* Global (non-field) error */}
      {appError && !appError.field && (
        <p role="alert" className="text-sm text-destructive">
          {appError.message}
        </p>
      )}

      <OfflineRetryBanner onRetry={handleRetry} disabled={isPending} />

      <Button
        type="button"
        disabled={!selectedCategoryId || isPending || !isOnline}
        onClick={submitForm}
        className="min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
      >
        {isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
