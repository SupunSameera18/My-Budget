"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { createBudget } from "@/features/budgets/server/actions";
import {
  BUDGET_PERIOD_TYPES,
  type BudgetFormData,
  type BudgetPeriodType,
} from "@/features/budgets/schema";

interface BudgetFormProps {
  data: BudgetFormData;
}

const PERIOD_LABELS: Record<BudgetPeriodType, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
};

export function BudgetForm({ data }: BudgetFormProps) {
  const router = useRouter();
  const [periodType, setPeriodType] = useState<BudgetPeriodType>("monthly");
  const [statusMessage, setStatusMessage] = useState("");
  const [fieldError, setFieldError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastFormDataRef = useRef<FormData | null>(null);

  async function handleSubmit(formData: FormData) {
    lastFormDataRef.current = formData;
    setStatusMessage("");
    setFieldError(null);
    setIsSubmitting(true);

    try {
      // Client-side guard: at least one category must be checked
      if (formData.getAll("category_ids").length === 0) {
        const msg = "Select at least one category";
        setStatusMessage(msg);
        setFieldError({ field: "category_ids", message: msg });
        return;
      }

      const result = await createBudget(formData);
      if (!result.ok) {
        setStatusMessage(result.error.message);
        if (result.error.field) {
          setFieldError({
            field: result.error.field,
            message: result.error.message,
          });
        }
      } else {
        router.push("/budgets");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void handleSubmit(new FormData(e.currentTarget));
  }

  if (data.categories.length === 0) {
    return (
      <p className="text-sm text-ink-secondary">
        No expense categories found — create some in Settings first.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* ARIA live region — always in DOM */}
      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>

      {/* Name */}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-ink-primary">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          placeholder="e.g. Groceries budget"
          className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary"
        />
        {fieldError?.field === "name" && (
          <p className="text-xs text-breathing-low-text">
            {fieldError.message}
          </p>
        )}
      </div>

      {/* Limit amount */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="limit_amount_display"
          className="text-sm font-medium text-ink-primary"
        >
          Limit ({data.currency})
        </label>
        <div className="flex min-h-[44px] items-center rounded-md border border-hairline bg-surface-base px-3">
          <span className="mr-2 text-sm text-ink-secondary">
            {data.currency}
          </span>
          <input
            id="limit_amount_display"
            name="limit_amount_display"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            className="flex-1 bg-transparent text-sm text-ink-primary outline-none"
          />
        </div>
        {fieldError?.field === "limit_amount_display" && (
          <p className="text-xs text-breathing-low-text">
            {fieldError.message}
          </p>
        )}
      </div>

      {/* Period type */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="period_type"
          className="text-sm font-medium text-ink-primary"
        >
          Period
        </label>
        <select
          id="period_type"
          name="period_type"
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as BudgetPeriodType)}
          className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 py-2 text-sm text-ink-primary"
        >
          {BUDGET_PERIOD_TYPES.map((pt) => (
            <option key={pt} value={pt}>
              {PERIOD_LABELS[pt]}
            </option>
          ))}
        </select>
      </div>

      {/* Custom date range — only when period_type = custom */}
      {periodType === "custom" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="period_start"
              className="text-sm font-medium text-ink-primary"
            >
              Start date
            </label>
            <input
              id="period_start"
              name="period_start"
              type="date"
              required
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
              htmlFor="period_end"
              className="text-sm font-medium text-ink-primary"
            >
              End date
            </label>
            <input
              id="period_end"
              name="period_end"
              type="date"
              required
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

      {/* Category checkboxes */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink-primary">
          Categories
        </legend>
        {data.categories.map((cat) => (
          <label
            key={cat.id}
            className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-ink-primary"
          >
            <input
              type="checkbox"
              name="category_ids"
              value={cat.id}
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

      <OfflineRetryBanner
        onRetry={() => {
          if (lastFormDataRef.current)
            void handleSubmit(lastFormDataRef.current);
        }}
      />

      <SubmitButton disabled={isSubmitting}>Create Budget</SubmitButton>
    </form>
  );
}
