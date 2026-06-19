"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { updateBudget, archiveBudget } from "@/features/budgets/server/actions";
import {
  BUDGET_PERIOD_TYPES,
  type BudgetWithActual,
  type BudgetPeriodType,
} from "@/features/budgets/schema";

interface BudgetCardProps {
  budget: BudgetWithActual;
  currency: string;
  allCategories: { id: string; name: string }[];
}

const PERIOD_LABELS: Record<BudgetPeriodType, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
};

function periodLabel(budget: BudgetWithActual): string {
  switch (budget.period_type) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    case "custom":
      return budget.period_start && budget.period_end
        ? `${budget.period_start} – ${budget.period_end}`
        : "Custom";
  }
}

export function BudgetCard({
  budget,
  currency,
  allCategories,
}: BudgetCardProps) {
  const pct = budget.pct_used;
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editPeriodType, setEditPeriodType] = useState<BudgetPeriodType>(
    budget.period_type,
  );

  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {statusMsg}
    </p>
  );

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    const formData = new FormData(e.currentTarget);

    if (formData.getAll("category_ids").length === 0) {
      const msg = "Select at least one category";
      setError(msg);
      setFieldError({ field: "category_ids", message: msg });
      return;
    }

    startTransition(async () => {
      const result = await updateBudget(budget.id, formData);
      if (!result.ok) {
        setError(result.error.message);
        if (result.error.field) {
          setFieldError({
            field: result.error.field,
            message: result.error.message,
          });
        }
      } else {
        setStatusMsg("Budget updated");
        setIsEditing(false);
      }
    });
  }

  function handleDeleteConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await archiveBudget(budget.id);
      if (!result.ok) {
        setError(result.error.message);
        setShowDeleteConfirm(false);
      } else {
        setStatusMsg("Budget deleted");
      }
    });
  }

  if (isEditing) {
    return (
      <article className="rounded-xl border border-hairline bg-card p-4 shadow-sm">
        {liveRegion}
        <form onSubmit={handleEdit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`bud-name-${budget.id}`}
              className="text-sm font-medium text-ink-primary"
            >
              Name
            </label>
            <input
              id={`bud-name-${budget.id}`}
              name="name"
              type="text"
              required
              maxLength={100}
              defaultValue={budget.name}
              autoComplete="off"
              className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary"
            />
            {fieldError?.field === "name" && (
              <p className="text-xs text-breathing-low-text">
                {fieldError.message}
              </p>
            )}
          </div>

          {/* Limit */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`bud-limit-${budget.id}`}
              className="text-sm font-medium text-ink-primary"
            >
              Limit ({currency})
            </label>
            <div className="flex min-h-[44px] items-center rounded-md border border-hairline bg-surface-base px-3">
              <span className="mr-2 text-sm text-ink-secondary">{currency}</span>
              <input
                id={`bud-limit-${budget.id}`}
                name="limit_amount_display"
                type="text"
                inputMode="decimal"
                required
                defaultValue={(budget.limit_minor / 100).toFixed(2)}
                autoComplete="off"
                className="flex-1 bg-transparent text-sm text-ink-primary outline-none"
              />
            </div>
            {fieldError?.field === "limit_amount_display" && (
              <p className="text-xs text-breathing-low-text">
                {fieldError.message}
              </p>
            )}
          </div>

          {/* Period */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`bud-period-${budget.id}`}
              className="text-sm font-medium text-ink-primary"
            >
              Period
            </label>
            <select
              id={`bud-period-${budget.id}`}
              name="period_type"
              value={editPeriodType}
              onChange={(e) =>
                setEditPeriodType(e.target.value as BudgetPeriodType)
              }
              className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary"
            >
              {BUDGET_PERIOD_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {PERIOD_LABELS[pt]}
                </option>
              ))}
            </select>
          </div>

          {editPeriodType === "custom" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`bud-start-${budget.id}`}
                  className="text-sm font-medium text-ink-primary"
                >
                  Start date
                </label>
                <input
                  id={`bud-start-${budget.id}`}
                  name="period_start"
                  type="date"
                  required
                  defaultValue={budget.period_start ?? ""}
                  className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary"
                />
                {fieldError?.field === "period_start" && (
                  <p className="text-xs text-breathing-low-text">
                    {fieldError.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`bud-end-${budget.id}`}
                  className="text-sm font-medium text-ink-primary"
                >
                  End date
                </label>
                <input
                  id={`bud-end-${budget.id}`}
                  name="period_end"
                  type="date"
                  required
                  defaultValue={budget.period_end ?? ""}
                  className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary"
                />
                {fieldError?.field === "period_end" && (
                  <p className="text-xs text-breathing-low-text">
                    {fieldError.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Categories */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink-primary">
              Categories
            </legend>
            {allCategories.map((cat) => (
              <label
                key={cat.id}
                className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-ink-primary"
              >
                <input
                  type="checkbox"
                  name="category_ids"
                  value={cat.id}
                  defaultChecked={budget.categories.some((c) => c.id === cat.id)}
                  className="h-4 w-4"
                />
                {cat.name}
              </label>
            ))}
            {fieldError?.field === "category_ids" && (
              <p className="text-xs text-breathing-low-text">
                {fieldError.message}
              </p>
            )}
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="min-h-[44px] flex-1 rounded-md bg-brand-accent-strong px-3 text-sm font-semibold text-brand-on-accent hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setIsEditing(false);
                setError(null);
                setFieldError(null);
                setEditPeriodType(budget.period_type);
              }}
              className="min-h-[44px] flex-1 rounded-md border border-hairline px-3 text-sm font-semibold text-ink-primary hover:bg-surface-inset disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  if (showDeleteConfirm) {
    return (
      <article className="rounded-xl border border-hairline bg-card p-4 shadow-sm">
        {liveRegion}
        <p className="mb-1 text-base font-semibold text-ink-primary">
          {budget.name}
        </p>
        <p className="mb-4 text-sm text-ink-secondary">
          Delete this budget? This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleDeleteConfirm}
            className="min-h-[44px] flex-1 rounded-md bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setShowDeleteConfirm(false);
              setError(null);
            }}
            className="min-h-[44px] flex-1 rounded-md border border-hairline px-3 text-sm font-semibold text-ink-primary hover:bg-surface-inset disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-hairline bg-card p-4 shadow-sm">
      {liveRegion}
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-ink-primary">
          {budget.name}
        </h2>
        <span className="text-sm font-medium text-ink-primary">
          {pct.toFixed(0)}%
        </span>
      </div>

      <p className="mb-3 text-xs text-ink-secondary">
        {budget.categories.length > 0
          ? `${budget.categories.map((c) => c.name).join(", ")} · `
          : ""}
        {periodLabel(budget)}
      </p>

      <ProgressBar
        pctUsed={pct}
        limitMarker
        ariaLabel={budget.name}
        className="mb-3"
      />

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-secondary">
          {formatMoney(budget.actual_minor, currency)} of{" "}
          {formatMoney(budget.limit_minor, currency)}
        </span>
        <span className="text-ink-primary">
          {budget.remaining_minor >= 0
            ? `${formatMoney(budget.remaining_minor, currency)} left`
            : `${formatMoney(Math.abs(budget.remaining_minor), currency)} over`}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setIsEditing(true);
            setError(null);
            setFieldError(null);
            setEditPeriodType(budget.period_type);
          }}
          className="min-h-[44px] flex-1 rounded-md border border-hairline px-3 text-sm font-medium text-ink-primary hover:bg-surface-inset disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setShowDeleteConfirm(true);
            setError(null);
          }}
          className="min-h-[44px] flex-1 rounded-md border border-hairline px-3 text-sm font-medium text-ink-secondary hover:bg-surface-inset disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </article>
  );
}
