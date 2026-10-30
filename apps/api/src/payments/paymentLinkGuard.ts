import type { PoolClient } from "pg";
import { ConflictError } from "../lib/errors.js";

export interface PaymentLinkClaim { linkId: string; reservationId: string }

/** Merchant capture/void previously bypassed an unknown checkout capture.
 * Lock the link before the transaction, matching checkout's lock order, and
 * allow only the original claim to resolve it. This preserves single use. */
export async function guardPaymentLinkAttempt(
  client: PoolClient, transactionId: string, merchantId: string, claim?: PaymentLinkClaim,
): Promise<void> {
  const result = await client.query<{ id: string; reservation_id: string }>(
    `SELECT id, reservation_id FROM payment_links
      WHERE merchant_id = $1 AND capture_attempt_transaction_id = $2
        AND status = 'reserved' AND capture_attempt_at IS NOT NULL FOR UPDATE`,
    [merchantId, transactionId],
  );
  for (const link of result.rows) {
    if (!claim || claim.linkId !== link.id || claim.reservationId !== link.reservation_id) {
      throw new ConflictError("payment_link_capture_unresolved");
    }
  }
}
