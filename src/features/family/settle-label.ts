import { formatMoney } from "@/lib/format";

export function deriveSettleUpLabel(
  tally: number,
  partnerDisplayName: string,
  currency: string,
): string {
  if (tally > 0) {
    return `Receive ${formatMoney(tally, currency)} from ${partnerDisplayName}`;
  }
  if (tally < 0) {
    return `Transfer ${formatMoney(Math.abs(tally), currency)} to ${partnerDisplayName}`;
  }
  return "You're all settled up.";
}
