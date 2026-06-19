"use client";

import { useState, useTransition, useRef } from "react";
import { type MacroWithTarget } from "@/features/macros/schema";
import { updateMacro, archiveMacro } from "@/features/macros/server/actions";
import { formatMoney } from "@/lib/format";

interface MacroCardProps {
  macro: MacroWithTarget;
  currency: string;
  accounts: Array<{ id: string; name: string }>;
  goals: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; type: string }>;
}

export function MacroCard({
  macro,
  currency,
  accounts,
  goals,
  categories,
}: MacroCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const initialTargetType = macro.account_id ? "account" : "goal";
  const [targetType, setTargetType] = useState<"account" | "goal">(
    initialTargetType,
  );

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatusMsg("");
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateMacro(macro.id, formData);
      if (!result.ok) {
        setError(result.error.message);
      } else {
        setStatusMsg("Macro updated");
        setIsEditing(false);
      }
    });
  }

  function handleArchiveConfirm() {
    setStatusMsg("");
    setError(null);
    startTransition(async () => {
      const result = await archiveMacro(macro.id);
      if (!result.ok) {
        setError(result.error.message);
        setShowArchiveConfirm(false);
      } else {
        setStatusMsg("Macro archived");
      }
    });
  }

  const targetLabel = macro.account_id
    ? `Account: ${macro.account_name ?? ""}`
    : `Goal: ${macro.goal_name ?? ""}`;

  // Always rendered at top level so screen readers pre-register it regardless of state
  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {statusMsg}
    </p>
  );

  if (isEditing) {
    return (
      <div className="rounded-lg bg-card px-4 py-3 shadow-sm">
        {liveRegion}
        <form
          ref={formRef}
          onSubmit={handleUpdate}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`macro-name-${macro.id}`}
              className="text-xs font-medium text-ink-secondary"
            >
              Name
            </label>
            <input
              id={`macro-name-${macro.id}`}
              name="name"
              type="text"
              defaultValue={macro.name}
              maxLength={100}
              required
              autoComplete="off"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`macro-amount-${macro.id}`}
              className="text-xs font-medium text-ink-secondary"
            >
              Amount
            </label>
            <input
              id={`macro-amount-${macro.id}`}
              name="amount_display"
              type="text"
              defaultValue={(macro.amount_minor / 100).toFixed(2)}
              placeholder="0.00"
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-secondary">
              Target
            </span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-ink-primary">
                <input
                  type="radio"
                  name="target_type"
                  value="account"
                  checked={targetType === "account"}
                  onChange={() => setTargetType("account")}
                />
                Account
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-primary">
                <input
                  type="radio"
                  name="target_type"
                  value="goal"
                  checked={targetType === "goal"}
                  onChange={() => setTargetType("goal")}
                />
                Goal
              </label>
            </div>
          </div>

          {targetType === "account" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`macro-account-${macro.id}`}
                className="text-xs font-medium text-ink-secondary"
              >
                Select account
              </label>
              {accounts.length === 0 ? (
                <p className="text-sm text-ink-secondary">
                  No accounts yet — create one at{" "}
                  <a href="/settings/accounts" className="underline">
                    Settings › Accounts
                  </a>
                </p>
              ) : (
                <select
                  id={`macro-account-${macro.id}`}
                  name="account_id"
                  defaultValue={macro.account_id ?? ""}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select an account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {targetType === "goal" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`macro-goal-${macro.id}`}
                className="text-xs font-medium text-ink-secondary"
              >
                Select goal
              </label>
              {goals.length === 0 ? (
                <p className="text-sm text-ink-secondary">
                  No goals yet — create one at{" "}
                  <a href="/goals" className="underline">
                    /goals
                  </a>
                </p>
              ) : (
                <select
                  id={`macro-goal-${macro.id}`}
                  name="goal_id"
                  defaultValue={macro.goal_id ?? ""}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select a goal</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {targetType === "account" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`macro-category-${macro.id}`}
                className="text-xs font-medium text-ink-secondary"
              >
                Category
              </label>
              <select
                id={`macro-category-${macro.id}`}
                name="category_id"
                defaultValue={macro.category_id ?? ""}
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="min-h-[44px] flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setIsEditing(false);
                setError(null);
                setStatusMsg("");
              }}
              className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-semibold text-ink-primary hover:bg-surface-inset disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (showArchiveConfirm) {
    return (
      <div className="rounded-lg bg-card px-4 py-3 shadow-sm">
        {liveRegion}
        <p className="mb-3 text-sm font-semibold text-ink-primary">
          {macro.name}
        </p>
        <p className="mb-3 text-sm text-ink-secondary">
          Archive this macro? It will no longer appear on the log surface.
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
            onClick={handleArchiveConfirm}
            className="min-h-[44px] flex-1 rounded-md bg-destructive px-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {isPending ? "Archiving…" : "Confirm"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setShowArchiveConfirm(false);
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
    <div className="rounded-lg bg-card px-4 py-3 shadow-sm">
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
          onClick={() => {
            setIsEditing(true);
            setError(null);
            setStatusMsg("");
          }}
          className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-medium text-ink-primary hover:bg-surface-inset disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setShowArchiveConfirm(true);
            setError(null);
          }}
          className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-medium text-ink-secondary hover:bg-surface-inset disabled:opacity-50"
        >
          Archive
        </button>
      </div>
    </div>
  );
}
