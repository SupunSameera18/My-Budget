"use client";

import { useState, useRef, useEffect } from "react";

function getCurrencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

interface CurrencyAmountInputProps {
  currency: string;
  name: string;
  id: string;
  disabled?: boolean;
  className?: string;
}

export function CurrencyAmountInput({
  currency,
  name,
  id,
  disabled,
  className,
}: CurrencyAmountInputProps) {
  const symbol = getCurrencySymbol(currency);
  const [rawValue, setRawValue] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [decimalError, setDecimalError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = containerRef.current?.closest("form");
    if (!form) return;
    function handleReset() {
      setRawValue("");
      setDisplayValue("");
      setDecimalError(false);
    }
    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    // Strip anything that isn't a digit or decimal point
    const stripped = val.replace(/[^0-9.]/g, "");
    // Allow only one decimal point
    const dotIndex = stripped.indexOf(".");
    const normalized =
      dotIndex === -1
        ? stripped
        : stripped.slice(0, dotIndex + 1) +
          stripped.slice(dotIndex + 1).replace(/\./g, "");
    const decimalMatch = normalized.match(/\.(\d+)$/);
    setDecimalError(!!decimalMatch && decimalMatch[1].length > 2);
    setRawValue(normalized);
    setDisplayValue(normalized);
  }

  function handleFocus() {
    setDisplayValue(rawValue);
  }

  function handleBlur() {
    if (!rawValue || rawValue === ".") {
      setRawValue("");
      setDisplayValue("");
      return;
    }
    const num = parseFloat(rawValue);
    if (isNaN(num)) {
      setDisplayValue(rawValue);
      return;
    }
    const decimals = (rawValue.split(".")[1] ?? "").length;
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: Math.min(decimals, 2),
      maximumFractionDigits: 2,
    }).format(num);
    setDisplayValue(formatted);
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 select-none text-sm text-ink-secondary">
          {symbol}
        </span>
        {/* Hidden input submits the raw numeric value (no commas) */}
        <input type="hidden" name={name} value={rawValue} />
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="0.00"
          disabled={disabled}
          aria-invalid={decimalError}
          className={`flex h-10 w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] ${className ?? ""}`}
        />
      </div>
      {decimalError && (
        <p className="text-xs text-destructive">Use only two decimal places.</p>
      )}
    </div>
  );
}
