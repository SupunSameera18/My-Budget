"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { splitTransactionAction } from "@/features/transactions/server/actions";
import { splitTransaction } from "@/lib/money/split";
import { formatMoney, currencySymbol } from "@/lib/format";
import type { SplitMethod } from "@/lib/money/split";

interface SplitSheetProps {
  transactionId: string;
  amountMinor: number;
  currency: string;
  partnerName: string;
  /** Whether the viewer logged (owns) the transaction. Drives the default
   *  "who paid" amount: the owner defaults to having paid the full bill, the
   *  partner to having paid nothing (i.e. the owner fronted it). */
  isOwner?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

export function SplitSheet({
  transactionId,
  amountMinor,
  currency,
  partnerName,
  isOwner = true,
  onSaved,
  onCancel,
}: SplitSheetProps) {
  const [isPending, startTransition] = useTransition();
  // "who paid" amounts: default to the owner having paid the full amount.
  const [method, setMethod] = useState<SplitMethod>("fixed");
  const [payerPct, setPayerPct] = useState(isOwner ? 100 : 0);
  const [payerFixed, setPayerFixed] = useState(isOwner ? amountMinor : 0);
  const [validationError, setValidationError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  function getPreview(): {
    payerShareMinor: number;
    partnerShareMinor: number;
  } {
    if (method === "equal") {
      return splitTransaction({ amountMinor, method: "equal" });
    }
    if (method === "percentage") {
      return splitTransaction({
        amountMinor,
        method: "percentage",
        payerPercentage: payerPct,
      });
    }
    return splitTransaction({
      amountMinor,
      method: "fixed",
      payerFixedMinor: payerFixed,
    });
  }

  function validate(): string {
    if (method === "percentage") {
      if (payerPct < 0 || payerPct > 100) {
        return "Percentage must be between 0 and 100";
      }
    }
    if (method === "fixed") {
      if (payerFixed < 0 || payerFixed > amountMinor) {
        return `What you paid must be between 0 and ${formatMoney(amountMinor, currency)}`;
      }
    }
    return "";
  }

  function handleSave() {
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError("");
    setStatusMsg("");

    const preview = getPreview();
    startTransition(async () => {
      const result = await splitTransactionAction(
        transactionId,
        method,
        preview.payerShareMinor,
        preview.partnerShareMinor,
      );
      if (result.ok) {
        setStatusMsg("Split saved");
        onSaved();
      } else {
        setStatusMsg("Error: " + result.error.message);
      }
    });
  }

  const preview = getPreview();
  const partnerPct = 100 - payerPct;

  return (
    <div className="flex flex-col gap-5" role="dialog" aria-label="Who paid">
      {/* ARIA live region — always mounted */}
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>

      <h3 className="text-sm font-bold text-ink-primary">Who paid?</h3>
      <p className="-mt-3 text-xs text-ink-secondary">
        Record how much each of you actually paid toward this. Settle-up
        rebalances you both toward an equal share.
      </p>

      {/* Split method selector */}
      <div role="radiogroup" aria-label="Split method" className="flex gap-2">
        {(["equal", "percentage", "fixed"] as SplitMethod[]).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={method === m}
            onClick={() => {
              setMethod(m);
              setValidationError("");
            }}
            className={`min-h-[44px] flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              method === m
                ? "border-brand-accent-strong bg-brand-accent-strong text-white"
                : "hover:bg-ink-secondary/10 border-hairline bg-surface-base text-ink-primary"
            }`}
          >
            {m === "equal"
              ? "Equal"
              : m === "percentage"
                ? "Percentage"
                : "Fixed"}
          </button>
        ))}
      </div>

      {/* Percentage inputs */}
      {method === "percentage" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="payer-pct"
              className="text-xs font-bold text-ink-secondary"
            >
              You paid (%)
            </label>
            <Input
              id="payer-pct"
              type="number"
              min={0}
              max={100}
              value={payerPct}
              onChange={(e) => {
                setPayerPct(Math.max(0, Math.min(100, Number(e.target.value))));
                setValidationError("");
              }}
              aria-label="You paid (%)"
              className="min-h-[44px] border border-hairline bg-surface-base text-ink-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="partner-pct"
              className="text-xs font-bold text-ink-secondary"
            >
              {partnerName} paid (%)
            </label>
            <Input
              id="partner-pct"
              type="number"
              value={partnerPct}
              readOnly
              aria-label="Partner paid (%)"
              className="min-h-[44px] border border-hairline bg-surface-base text-ink-secondary opacity-60"
            />
          </div>
        </div>
      )}

      {/* Fixed inputs */}
      {method === "fixed" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="payer-fixed"
              className="text-xs font-bold text-ink-secondary"
            >
              You paid ({currencySymbol(currency)})
            </label>
            <Input
              id="payer-fixed"
              type="number"
              min={0}
              max={amountMinor / 100}
              step={0.01}
              value={(payerFixed / 100).toFixed(2)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setPayerFixed(Number.isNaN(v) ? 0 : Math.round(v * 100));
                setValidationError("");
              }}
              aria-label="You paid"
              className="min-h-[44px] border border-hairline bg-surface-base text-ink-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="partner-fixed"
              className="text-xs font-bold text-ink-secondary"
            >
              {partnerName} paid ({currencySymbol(currency)})
            </label>
            <Input
              id="partner-fixed"
              type="number"
              value={((amountMinor - payerFixed) / 100).toFixed(2)}
              readOnly
              aria-label="Partner paid"
              className="min-h-[44px] border border-hairline bg-surface-base text-ink-secondary opacity-60"
            />
          </div>
        </div>
      )}

      {/* Validation error */}
      {validationError && (
        <span role="alert" className="text-sm text-destructive">
          {validationError}
        </span>
      )}

      {/* Live preview */}
      <p aria-live="polite" className="text-sm text-ink-primary">
        You paid:{" "}
        <span className="font-semibold">
          {formatMoney(preview.payerShareMinor, currency)}
        </span>{" "}
        | {partnerName} paid:{" "}
        <span className="font-semibold">
          {formatMoney(preview.partnerShareMinor, currency)}
        </span>
      </p>

      {/* Save button */}
      <Button
        type="button"
        onClick={handleSave}
        disabled={isPending || !!validationError}
        aria-disabled={isPending || !!validationError}
        className="min-h-[44px] w-full rounded-md bg-brand-accent-strong font-bold text-white"
      >
        {isPending ? "Saving…" : "Save split"}
      </Button>

      {/* Cancel */}
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={isPending}
        className="min-h-[44px] w-full text-ink-secondary"
      >
        Cancel
      </Button>
    </div>
  );
}
