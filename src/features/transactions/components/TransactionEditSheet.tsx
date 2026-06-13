"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  editTransaction,
  editSharedTransaction,
  deleteTransaction,
} from "@/features/transactions/server/actions";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SplitSheet } from "@/features/transactions/components/SplitSheet";
import type { Account } from "@/features/accounts/schema";
import type {
  Transaction,
  TransactionCategory,
  Subcategory,
  ActivityTrailEntry,
} from "@/features/transactions/schema";

interface TransactionEditSheetProps {
  transaction: Transaction;
  accounts: Account[];
  categories: TransactionCategory[];
  currency: string;
  subcategoriesEnabled: boolean;
  subcategories: Subcategory[];
  activityTrail: ActivityTrailEntry[];
  isShared?: boolean;
  partnerName?: string;
  viewerUserId: string;
}

export function TransactionEditSheet({
  transaction,
  accounts,
  categories,
  currency,
  subcategoriesEnabled,
  subcategories,
  activityTrail,
  isShared = false,
  partnerName = "Your partner",
  viewerUserId,
}: TransactionEditSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isOnline = useOnlineStatus();
  const [showSplitSheet, setShowSplitSheet] = useState(false);

  const [amountDisplay, setAmountDisplay] = useState(
    (transaction.amount_minor / 100).toFixed(2),
  );
  const [selectedAccountId, setSelectedAccountId] = useState(
    transaction.account_id,
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    transaction.category_id,
  );
  const [selectedDate, setSelectedDate] = useState(transaction.date);
  const [note, setNote] = useState(transaction.note ?? "");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(
    transaction.subcategory_id ?? "",
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  const availableSubcategories = subcategoriesEnabled
    ? subcategories.filter((s) => s.category_id === selectedCategoryId)
    : [];

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("account_id", selectedAccountId);
    fd.set("category_id", selectedCategoryId);
    fd.set("amount_display", amountDisplay);
    fd.set("date", selectedDate);
    if (note.trim()) fd.set("note", note.trim());
    if (subcategoriesEnabled && selectedSubcategoryId) {
      fd.set("subcategory_id", selectedSubcategoryId);
    }
    return fd;
  }

  function buildSharedFormData(): FormData {
    const fd = new FormData();
    fd.set("category_id", selectedCategoryId);
    if (note.trim()) fd.set("note", note.trim());
    return fd;
  }

  function handleSave() {
    setLiveMessage("");
    startTransition(async () => {
      const result = isShared
        ? await editSharedTransaction(transaction.id, buildSharedFormData())
        : await editTransaction(transaction.id, buildFormData());
      if (result.ok) {
        setLiveMessage("Transaction updated");
        router.refresh();
      } else {
        setLiveMessage("Save failed: " + result.error.message);
      }
    });
  }

  function handleDelete() {
    setLiveMessage("");
    startTransition(async () => {
      const result = await deleteTransaction(transaction.id);
      if (result.ok) {
        setLiveMessage("Transaction deleted");
        router.push("/transactions");
      } else {
        setLiveMessage("Delete failed: " + result.error.message);
        setShowDeleteConfirm(false);
      }
    });
  }

  if (showSplitSheet) {
    return (
      <SplitSheet
        transactionId={transaction.id}
        amountMinor={transaction.amount_minor}
        currency={currency}
        partnerName={partnerName}
        onSaved={() => {
          setShowSplitSheet(false);
          router.refresh();
        }}
        onCancel={() => setShowSplitSheet(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ARIA live region — always present; screen readers announce changes */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveMessage}
      </div>

      {/* Amount */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="amount_display"
          className="text-xs font-bold text-ink-secondary"
        >
          Amount{" "}
          <span className="font-normal text-ink-secondary">({currency})</span>
        </label>
        {/* hint is always in DOM so screen readers can reference it via aria-describedby */}
        <span id="amount-readonly-hint" className="sr-only">
          To correct a shared amount, use Close-the-Month correction (available
          in a future update).
        </span>
        <Input
          id="amount_display"
          type="text"
          inputMode="decimal"
          value={amountDisplay}
          onChange={(e) => setAmountDisplay(e.target.value)}
          disabled={isShared}
          aria-disabled={isShared ? "true" : undefined}
          aria-describedby={isShared ? "amount-readonly-hint" : undefined}
          className={`min-h-[44px] border border-hairline bg-surface-base text-ink-primary${isShared ? " cursor-not-allowed opacity-60" : ""}`}
        />
      </div>

      {/* Account */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="account_id"
          className="text-xs font-bold text-ink-secondary"
        >
          Account
        </label>
        <select
          id="account_id"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="flex min-h-[44px] w-full rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="category_id"
          className="text-xs font-bold text-ink-secondary"
        >
          Category
        </label>
        <select
          id="category_id"
          value={selectedCategoryId}
          onChange={(e) => {
            setSelectedCategoryId(e.target.value);
            setSelectedSubcategoryId("");
          }}
          className="flex min-h-[44px] w-full rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Category"
        >
          {expenseCategories.length > 0 && (
            <optgroup label="Expense">
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {incomeCategories.length > 0 && (
            <optgroup label="Income">
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Subcategory (conditional) */}
      {subcategoriesEnabled && availableSubcategories.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="subcategory_id"
            className="text-xs font-bold text-ink-secondary"
          >
            Subcategory{" "}
            <span className="font-normal text-ink-secondary">(optional)</span>
          </label>
          <select
            key={selectedCategoryId}
            id="subcategory_id"
            value={selectedSubcategoryId}
            onChange={(e) => setSelectedSubcategoryId(e.target.value)}
            className="flex min-h-[44px] w-full rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      {/* Date */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="txn_date"
          className="text-xs font-bold text-ink-secondary"
        >
          Date
        </label>
        <input
          id="txn_date"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="flex min-h-[44px] w-full rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Date"
        />
      </div>

      {/* Note */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-xs font-bold text-ink-secondary">
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
          className="min-h-[44px] border border-hairline bg-surface-base text-ink-primary"
        />
      </div>

      {/* Offline message */}
      {!isOnline && (
        <p className="text-sm text-destructive">
          You&apos;re offline — cannot save right now
        </p>
      )}

      {/* Save button */}
      <Button
        type="button"
        disabled={isPending || !isOnline}
        onClick={handleSave}
        className="min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
      >
        {isPending ? "Saving…" : "Save changes"}
      </Button>

      {/* Edit split — only for Shared transactions */}
      {isShared && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowSplitSheet(true)}
          disabled={isPending}
          className="min-h-[44px] w-full"
        >
          Edit split
        </Button>
      )}

      {/* Delete section — only owner can delete; partner sees no delete button */}
      {isShared && viewerUserId !== transaction.user_id ? null : !showDeleteConfirm ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowDeleteConfirm(true)}
          className="min-h-[44px] w-full text-destructive hover:text-destructive"
          disabled={isPending}
        >
          Delete transaction
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-ink-primary">
            This will remove the transaction and reverse its balance effect.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={isPending}
              onClick={handleDelete}
              className="min-h-[44px] flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setShowDeleteConfirm(false)}
              className="min-h-[44px] flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Activity Trail (History) */}
      {activityTrail.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-ink-primary">History</h2>
          <ol className="flex flex-col gap-2">
            {activityTrail.map((entry) => {
              const editorLabel =
                entry.user_id === viewerUserId ? "You" : partnerName;
              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-0.5 rounded-lg bg-surface-inset px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-primary">
                      {editorLabel}
                    </span>
                    <span className="text-ink-secondary">
                      {new Date(entry.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        entry.change_type === "delete"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-brand-accent-strong/10 text-brand-accent-strong"
                      }`}
                    >
                      {entry.change_type === "delete" ? "Deleted" : "Edited"}
                    </span>
                  </div>
                  {entry.change_type === "delete" ? (
                    <span className="text-ink-secondary">
                      Transaction removed
                    </span>
                  ) : (
                    <span className="text-ink-secondary">
                      {Object.keys(entry.changed_fields).length > 0
                        ? "Changed: " +
                          Object.keys(entry.changed_fields).join(", ")
                        : "No fields changed"}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
