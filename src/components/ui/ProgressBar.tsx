interface ProgressBarProps {
  pctUsed: number;
  limitMarker?: boolean;
  noAmber?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function ProgressBar({
  pctUsed,
  limitMarker = false,
  noAmber,
  ariaLabel,
  className,
}: ProgressBarProps) {
  const fillWidth = Math.min(100, pctUsed);
  const isRed = !noAmber && pctUsed >= 100;
  const isAmber = !noAmber && pctUsed >= 80 && !isRed;
  const fillStyle: React.CSSProperties = isRed
    ? { background: "#E05252", width: `${fillWidth}%` }
    : isAmber
      ? { background: "#C9A24B", width: `${fillWidth}%` }
      : {
          background: "linear-gradient(90deg, #4FA6A6, #5FA98C)",
          width: `${fillWidth}%`,
        };

  return (
    <div
      className={`relative h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ""}`}
    >
      <div
        className="h-full rounded-full motion-safe:transition-all"
        style={fillStyle}
        role="progressbar"
        aria-valuenow={Math.min(100, Math.round(pctUsed))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? "Budget usage"}
      />
      {limitMarker && (
        <div
          className="bg-ink-secondary/30 absolute inset-y-0 right-0 w-px"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
