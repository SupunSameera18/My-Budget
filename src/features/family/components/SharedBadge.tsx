interface SharedBadgeProps {
  isFamilyMode: boolean;
  isShared: boolean;
  ariaLabel?: string;
}

export function SharedBadge({
  isFamilyMode,
  isShared,
  ariaLabel = "Shared transaction",
}: SharedBadgeProps) {
  if (!isFamilyMode || !isShared) return null;

  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-brand-accent"
      style={{ backgroundColor: "rgba(79, 166, 166, 0.1)" }}
      aria-label={ariaLabel}
    >
      Shared
    </span>
  );
}
