"use client";

import { useState, useTransition, useRef } from "react";
import { createMacro } from "@/features/macros/server/actions";

interface CreateMacroFormProps {
  accounts: Array<{ id: string; name: string }>;
  goals: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; type: string }>;
}

export function CreateMacroForm({
  accounts,
  goals,
  categories,
}: CreateMacroFormProps) {
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [targetType, setTargetType] = useState<"account" | "goal">("account");
  const formRef = useRef<HTMLFormElement>(null);

  function handleCreate(formData: FormData) {
    setStatusMsg("");
    setErrorMsg("");
    startTransition(async () => {
      const result = await createMacro(formData);
      if (!result.ok) {
        setErrorMsg(result.error.message);
      } else {
        setStatusMsg("Macro created");
        formRef.current?.reset();
        setTargetType("account");
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void handleCreate(new FormData(e.currentTarget));
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="create-macro-name"
          className="text-xs font-medium text-ink-secondary"
        >
          Name
        </label>
        <input
          id="create-macro-name"
          name="name"
          type="text"
          maxLength={100}
          required
          autoComplete="off"
          placeholder="e.g. Netflix subscription"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="create-macro-amount"
          className="text-xs font-medium text-ink-secondary"
        >
          Amount
        </label>
        <input
          id="create-macro-amount"
          name="amount_display"
          type="text"
          placeholder="0.00"
          required
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink-secondary">Target</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-primary">
            <input
              type="radio"
              name="target_type"
              value="account"
              checked={targetType === "account"}
              onChange={() => setTargetType("account")}
              aria-label="Account"
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
              aria-label="Goal"
            />
            Goal
          </label>
        </div>
      </div>

      {targetType === "account" && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="create-macro-account"
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
              id="create-macro-account"
              name="account_id"
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
            htmlFor="create-macro-goal"
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
              id="create-macro-goal"
              name="goal_id"
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
            htmlFor="create-macro-category"
            className="text-xs font-medium text-ink-secondary"
          >
            Category
          </label>
          <select
            id="create-macro-category"
            name="category_id"
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

      <p role="status" aria-live="polite" className="sr-only">
        {statusMsg}
      </p>

      {errorMsg && (
        <p role="alert" className="text-sm text-destructive">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-[44px] w-full rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add Macro"}
      </button>
    </form>
  );
}
