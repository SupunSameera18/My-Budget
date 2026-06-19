"use client";

import { useState, useTransition } from "react";
import { type MacroWithTarget } from "@/features/macros/schema";
import { unarchiveMacro, deleteMacro } from "@/features/macros/server/actions";
import { formatMoney } from "@/lib/format";

interface ArchivedMacroCardProps {
  macro: MacroWithTarget;
  currency: string;
}

export function ArchivedMacroCard({ macro, currency }: ArchivedMacroCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const targetLabel = macro.account_id
    ? `Account: ${macro.account_name ?? ""}`
    : `Goal: ${macro.goal_name ?? ""}`;

  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {statusMsg}
    </p>
  );

  function handleUnarchive() {
    setError(null);
    setStatusMsg("");
    startTransition(async () => {
      const result = await unarchiveMacro(macro.id);
      if (!result.ok) {
        setError(result.error.message);
      } else {
        setStatusMsg("Macro restored");
      }
    });
  }

  function handleDeleteConfirm() {
    setError(null);
    setStatusMsg("");
    startTransition(async () => {
      const result = await deleteMacro(macro.id);
      if (!result.ok) {
        setError(result.error.message);
        setShowDeleteConfirm(false);
      } else {
        setStatusMsg("Macro deleted");
      }
    });
  }

  if (showDeleteConfirm) {
    return (
      <div className="rounded-lg bg-card px-4 py-3 opacity-75 shadow-sm">
        {liveRegion}
        <p className="mb-3 text-sm font-semibold text-ink-primary">
          {macro.name}
        </p>
        <p className="mb-3 text-sm text-ink-secondary">
          Permanently delete this macro? This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mb-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleDeleteConfirm}
            className="min-h-[44px] flex-1 rounded-md bg-destructive px-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete permanently"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setShowDeleteConfirm(false);
              setError(null);
            }}
            className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-semibold text-ink-primary hover:bg-surface-inset disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-card px-4 py-3 opacity-75 shadow-sm">
      {liveRegion}
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-ink-primary">{macro.name}</p>
        <p className="font-mono text-sm tabular-nums text-ink-primary">
          {formatMoney(macro.amount_minor, currency)}
        </p>
        <p className="text-xs text-ink-secondary">{targetLabel}</p>
        {macro.account_id && macro.category_name && (
          <p className="text-xs text-ink-secondary">{macro.category_name}</p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={handleUnarchive}
          className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-medium text-ink-primary hover:bg-surface-inset disabled:opacity-50"
        >
          {isPending ? "Restoring…" : "Unarchive"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setShowDeleteConfirm(true);
            setError(null);
          }}
          className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-medium text-destructive hover:bg-surface-inset disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
