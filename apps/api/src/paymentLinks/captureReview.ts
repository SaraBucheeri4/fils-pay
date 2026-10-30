import type { Pool } from "pg";
import type { AcquirerSimulator } from "../acquirer/types.js";
import { insertAdminAuditLog } from "../adminAudit/log.js";
import { withTransaction } from "../db/withTransaction.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { captureTransaction } from "../payments/capture.js";
import { voidTransaction } from "../payments/void.js";

export type CaptureReviewResolution = "retry_capture" | "release";

export interface PaymentLinkCaptureReview {
  id: string;
  transactionId: string | null;
  amountFils: number;
  captureAttemptAt: string;
}

interface AttemptRow {
  id: string;
  merchant_id: string;
  amount_fils: string | number;
  reservation_id: string;
  capture_attempt_at: Date;
  capture_attempt_transaction_id: string;
  capture_attempt_idempotency_key: string;
}

const ATTEMPT_COLUMNS = `id, merchant_id, amount_fils, reservation_id, capture_attempt_at,
  capture_attempt_transaction_id, capture_attempt_idempotency_key`;
const UNRESOLVED = `status = 'reserved' AND capture_attempt_at IS NOT NULL
  AND capture_attempt_at < now() - ($2 || ' seconds')::interval`;

/** ADR-0013: links whose capture outcome is unknown, past the in-flight window. */
export async function listPaymentLinkCaptureReviews(
  pool: Pool,
  merchantId: string,
  timeoutSeconds: number,
): Promise<PaymentLinkCaptureReview[]> {
  const result = await pool.query<AttemptRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM payment_links
      WHERE merchant_id = $1 AND ${UNRESOLVED} ORDER BY capture_attempt_at`,
    [merchantId, timeoutSeconds],
  );
  return result.rows.map((row) => ({
    id: row.id,
    transactionId: row.capture_attempt_transaction_id,
    amountFils: Number(row.amount_fils),
    captureAttemptAt: row.capture_attempt_at.toISOString(),
  }));
}

/**
 * Resolves an unknown capture. retry_capture resends the same idempotency key,
 * so the acquirer cannot charge twice and the link finalizes on success.
 * release is for when the acquirer has confirmed no charge: it voids the
 * authorization and reopens the link. A voided authorization that was in fact
 * captured at the acquirer is the operator's confirmation to get right, so it
 * is audited under their identity.
 */
export async function resolvePaymentLinkCaptureReview(
  pool: Pool,
  acquirer: AcquirerSimulator,
  input: {
    merchantId: string;
    linkId: string;
    adminUserId: string;
    resolution: CaptureReviewResolution;
    timeoutSeconds: number;
  },
): Promise<{ status: string; outcome: string }> {
  const found = await pool.query<AttemptRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM payment_links WHERE merchant_id = $1 AND ${UNRESOLVED} AND id = $3`,
    [input.merchantId, input.timeoutSeconds, input.linkId],
  );
  const link = found.rows[0];
  if (!link) throw new NotFoundError("capture_review_not_found");

  const transactionId = link.capture_attempt_transaction_id;
  const actor = { type: "system" as const, id: link.id };

  let outcome: string;
  if (input.resolution === "retry_capture") {
    const captured = await captureTransaction(pool, acquirer, {
      paymentLinkClaim: { linkId: link.id, reservationId: link.reservation_id },
      transactionId,
      merchantId: link.merchant_id,
      idempotencyKey: link.capture_attempt_idempotency_key,
      actor,
    });
    if (captured.statusCode >= 500) throw new ConflictError("capture_outcome_still_unknown");
    outcome = captured.statusCode === 200 ? "captured" : "refused";
    if (captured.statusCode !== 200) await voidTransaction(pool, { transactionId, merchantId: link.merchant_id, actor });
  } else {
    const voided = await voidTransaction(pool, { transactionId, merchantId: link.merchant_id, actor });
    if (voided.statusCode !== 200) throw new ConflictError("authorization_already_captured");
    outcome = "released";
  }

  return withTransaction(pool, async (client) => {
    if (outcome === "captured") {
      // A replayed capture (its first run committed) did not mark the link.
      await client.query(
        `UPDATE payment_links SET status = 'paid', paid_at = COALESCE(paid_at, now()), transaction_id = $2,
                reserved_at = NULL, capture_attempt_at = NULL, capture_attempt_transaction_id = NULL,
                capture_attempt_idempotency_key = NULL
          WHERE id = $1 AND status = 'reserved' AND reservation_id = $3`,
        [link.id, transactionId, link.reservation_id],
      );
    } else {
      await client.query(
        `UPDATE payment_links SET status = 'active', reserved_at = NULL, reservation_id = NULL,
                capture_attempt_at = NULL, capture_attempt_transaction_id = NULL,
                capture_attempt_idempotency_key = NULL
          WHERE id = $1 AND status = 'reserved' AND reservation_id = $2`,
        [link.id, link.reservation_id],
      );
    }
    await insertAdminAuditLog(client, {
      adminUserId: input.adminUserId,
      action: "payment_link_capture_review",
      targetType: "merchant",
      targetId: input.merchantId,
      metadata: { linkId: link.id, transactionId, resolution: input.resolution, outcome },
    });
    return { status: outcome === "captured" ? "paid" : "active", outcome };
  });
}
