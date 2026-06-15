export type SplitMethod = "equal" | "percentage" | "fixed";

export interface SplitInput {
  amountMinor: number;
  method: SplitMethod;
  payerPercentage?: number; // 0–100 integer, for "percentage" method
  payerFixedMinor?: number; // integer minor units, for "fixed" method
}

export interface SplitResult {
  payerShareMinor: number;
  partnerShareMinor: number;
}

export function splitTransaction(input: SplitInput): SplitResult {
  const { amountMinor, method, payerPercentage, payerFixedMinor } = input;

  let payerShare: number;

  switch (method) {
    case "equal":
      payerShare = Math.ceil(amountMinor / 2);
      break;
    case "percentage": {
      const pct = payerPercentage ?? 50;
      // Derive partner's share via floor, then payer absorbs remainder
      const partnerShare = Math.floor((amountMinor * (100 - pct)) / 100);
      payerShare = amountMinor - partnerShare;
      break;
    }
    case "fixed":
      payerShare = payerFixedMinor ?? 0;
      break;
    default:
      payerShare = Math.ceil(amountMinor / 2);
  }

  return {
    payerShareMinor: payerShare,
    partnerShareMinor: amountMinor - payerShare,
  };
}
