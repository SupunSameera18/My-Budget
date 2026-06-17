import { z } from "zod";
import { parseAmountMinor } from "./parse-minor";

// Absolute max: 10 million display units → 1 billion minor units.
// Keeps values in JS safe-integer territory and sane for a personal budget app.
export const MAX_DISPLAY_AMOUNT = 10_000_000;
const MAX_MINOR_UNITS = MAX_DISPLAY_AMOUNT * 100; // 1_000_000_000

/**
 * Shared Zod schema for user-facing money display amounts.
 *
 * Enforces:
 *   - Only digits and an optional 1–2 decimal places (rejects scientific notation, negatives)
 *   - Upper bound of 10,000,000 display units (1 billion minor units)
 *
 * Does NOT enforce > 0 — add `.refine(v => parseAmountMinor(v) > 0, ...)` at the call
 * site when "must be positive" is required.
 */
export const moneyDisplaySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount (e.g. 50.00)")
  .refine((v) => parseAmountMinor(v) <= MAX_MINOR_UNITS, {
    message: `Amount must not exceed ${MAX_DISPLAY_AMOUNT.toLocaleString()}`,
  });
