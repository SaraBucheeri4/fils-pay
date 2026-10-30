import type { Pool } from "pg";
import type { AcquirerSimulator } from "../acquirer/types.js";
import { insertAdminAuditLog, markAdminAuditOutcome } from "../adminAudit/log.js";
import { withTransaction } from "../db/withTransaction.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import { captureTransaction } from "../payments/capture.js";
import { voidTransaction } from "../payments/void.js";

export type CaptureReviewResolution = "retry_capture" | "release";

export interface PaymentLinkCaptureReview {
  id: string;
  merchantId: string;
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
  merchantId: string | null,
  timeoutSeconds: number,
  limit = 100,
  offset = 0,
): Promise<PaymentLinkCaptureReview[]> {
  const result = await pool.query<AttemptRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM payment_links
      WHERE ($1::uuid IS NULL OR merchant_id = $1) AND ${UNRESOLVED}
      ORDER BY capture_attempt_at, id LIMIT $3 OFFSET $4`,
    [merchantId, timeoutSeconds, limit, offset],
  );
  return result.rows.map((row) => ({
    id: row.id,
    merchantId: row.merchant_id,
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
    releaseEvidence?: string;
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

  // Release formerly stored no evidence of the no-charge confirmation.
  // Require a reference/note and retain it with the durable attempt audit.
  if (input.resolution === "release" && (typeof input.releaseEvidence !== "string" || !input.releaseEvidence.trim() || input.releaseEvidence.length > 2000)) {
    throw new BadRequestError("release_evidence_required", "Record the acquirer confirmation reference or note before release");
  }
  // Previously capture/void committed before any admin audit existed. Commit
  // the attempted action first so errors and crashes cannot erase who acted.
  const auditLogId = await withTransaction(pool, (client) => insertAdminAuditLog(client, {
    adminUserId: input.adminUserId, action: "payment_link_capture_review",
    targetType: "merchant", targetId: input.merchantId, outcome: "failed",
    metadata: { linkId: link.id, transactionId, resolution: input.resolution,
      phase: "attempted", releaseEvidence: input.resolution === "release" ? input.releaseEvidence!.trim() : null },
  }));
  try {
    let outcome: string;
    if (input.resolution === "retry_capture") {
      const captured = await captureTransaction(pool, acquirer, {
        paymentLinkClaim: { linkId: link.id, reservationId: link.reservation_id },
        transactionId,
        merchantId: link.merchant_id,
        idempotencyKey: link.capture_attempt_idempotency_key,
        actor,
      });
      if (captured.statusCode !== 200 && captured.statusCode !== 402) throw new ConflictError("capture_outcome_still_unknown");
      outcome = captured.statusCode === 200 ? "captured" : "refused";
      // A local 409/422 is not an acquirer refusal. Only 402 permits release,
      // and a failed void must preserve the block instead of admitting a buyer.
      if (captured.statusCode === 402) {
        const voided = await voidTransaction(pool, { transactionId, merchantId: link.merchant_id, actor,
          paymentLinkClaim: { linkId: link.id, reservationId: link.reservation_id } });
        if (voided.statusCode !== 200) throw new ConflictError("capture_outcome_still_unknown");
      }
    } else {
      const voided = await voidTransaction(pool, { transactionId, merchantId: link.merchant_id, actor,
        paymentLinkClaim: { linkId: link.id, reservationId: link.reservation_id } });
      if (voided.statusCode !== 200) throw new ConflictError("authorization_already_captured");
      outcome = "released";
    }

    return await withTransaction(pool, async (client) => {
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
      await client.query(`UPDATE admin_audit_log SET outcome = 'succeeded',
        metadata = metadata || $2::jsonb WHERE id = $1`,
        [auditLogId, JSON.stringify({ phase: "completed", outcome })]);
      return { status: outcome === "captured" ? "paid" : "active", outcome };
    });
  } catch (error) {
    await markAdminAuditOutcome(pool, auditLogId, "failed", { phase: "failed", error: error instanceof Error ? error.message : "unknown" })
      .catch((auditError: unknown) => console.error("capture review outcome audit failed", { auditLogId, error: auditError }));
    throw error;
  }
}
