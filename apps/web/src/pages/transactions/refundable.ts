import { parseBhdToFils, toFils } from "@filspay/money";
import type { TransactionDto } from "../../types.js";

const REFUNDABLE_STATUSES = new Set(["captured", "partially_captured", "partially_refunded"]);

/** Informational only: the server enforces the real limit under its row lock. */
export function remainingRefundableFils(txn: Pick<TransactionDto, "status" | "capturedFils" | "refundedFils">): number {
  if (!REFUNDABLE_STATUSES.has(txn.status)) return 0;
  return Math.max(0, txn.capturedFils - txn.refundedFils);
}

/** Blank means "everything still refundable". Throws on anything else invalid. */
export function parseRefundAmountFils(text: string, remainingFils: number): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const amount = toFils(parseBhdToFils(trimmed));
  if (amount <= 0) throw new RangeError("Enter an amount above zero.");
  if (amount > remainingFils) throw new RangeError("That is more than can still be refunded.");
  return amount;
}
