"use client";

interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
}

const MAX_DECIMAL_PLACES = 2;

function hasMaxDecimals(val: string): boolean {
  const dotIndex = val.indexOf(".");
  if (dotIndex === -1) return false;
  return val.length - dotIndex - 1 >= MAX_DECIMAL_PLACES;
}

export function NumberPad({ value, onChange }: NumberPadProps) {
  function handleDigit(d: string) {
    if (value === "0") {
      onChange(d);
      return;
    }
    if (hasMaxDecimals(value)) return;
    onChange(value + d);
  }

  function handleDecimal() {
    if (value.includes(".")) return;
    onChange(value + ".");
  }

  function handleBackspace() {
    if (value.length <= 1) {
      onChange("0");
      return;
    }
    onChange(value.slice(0, -1));
  }

  const btnBase =
    "min-h-[44px] min-w-[44px] rounded-lg bg-surface-inset font-semibold text-ink-primary transition-transform hover:bg-surface-inset/70 active:scale-95";

  return (
    <div
      className="grid grid-cols-3 gap-2"
      role="group"
      aria-label="Number pad"
    >
      {(["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const).map((d) => (
        <button
          key={d}
          type="button"
          className={btnBase}
          onClick={() => handleDigit(d)}
        >
          {d}
        </button>
      ))}
      <button type="button" className={btnBase} onClick={handleDecimal}>
        .
      </button>
      <button
        type="button"
        className={btnBase}
        onClick={() => handleDigit("0")}
      >
        0
      </button>
      <button
        type="button"
        className={btnBase}
        onClick={handleBackspace}
        aria-label="Backspace"
      >
        ⌫
      </button>
    </div>
  );
}
