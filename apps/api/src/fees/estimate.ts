import { applyRateFils, subtractFils, toFils } from "@filspay/money";

/** Architecture: discount the capture amount before applying MDR. */
export function estimateFeeFils(amountFils: number, mdrBps: number, discountBps: number): number {
 const amount = toFils(amountFils);
 return applyRateFils(subtractFils(amount, applyRateFils(amount, discountBps)), mdrBps);
}
