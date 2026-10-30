import type { Pool } from "pg";
import { toFils } from "@filspay/money";
import { authorizeTransaction } from "../payments/authorize.js";
import { captureTransaction } from "../payments/capture.js";
import { voidTransaction } from "../payments/void.js";
import type { AcquirerSimulator, SimulatedCardInput } from "../acquirer/types.js";

export interface PayPaymentLinkInput {
  token: string;
  card: SimulatedCardInput;
  idempotencyKey: string;
  submittedAt?: string;
}

export interface PayPaymentLinkResult {
  statusCode: number;
  body: unknown;
}

/** Returned by the claim UPDATE; merchant_id comes from the link row, never from the request. */
interface ClaimedLinkRow {
  id: string;
  merchant_id: string;
  amount_fils: string | number;
  reference: string | null;
  reservation_id: string;
}

interface LinkStatusRow {
  status: string;
  expires_at: Date;
}

/** Server-time diagnostic reference; client timestamps never grant validity. */
export function expiryReferenceTime(_submittedAt?: string): Date {
  return new Date();
}

/**
 * `POST /v1/payment-links/:token/pay` business logic (public,
 * unauthenticated). Calls `authorizeTransaction`
 * then `captureTransaction` directly, in sequence, never issuing an HTTP
 * request back into the API's own /v1/transactions routes.
 *
 * Each reservation has its own identity. Capture locks and validates that
 * identity before contacting the acquirer, then marks the link paid in the
 * same transaction. A timed-out authorization cannot capture a newer claim.
 * Once a capture attempt starts, its outcome must be known before anyone else
 * can be charged (ADR-0013); see captureReview.ts for resolving an unknown one.
 */
export async function payPaymentLink(
  pool: Pool,
  acquirer: AcquirerSimulator,
  config: { paymentLinkReservationTimeoutSeconds: number },
  input: PayPaymentLinkInput,
): Promise<PayPaymentLinkResult> {
  // Step 1 — claim. A single UPDATE is already atomic; no explicit
  // transaction needed.
  // YA: one conditional UPDATE = atomic claim, no explicit txn needed. correct
  const claimResult = await pool.query<ClaimedLinkRow>(
    `UPDATE payment_links
        SET status = 'reserved', reserved_at = now(), reservation_id = gen_random_uuid()
      WHERE token = $1
        AND (
             status = 'active'
             OR (status = 'reserved' AND capture_attempt_at IS NULL
                 AND reserved_at < now() - ($2 || ' seconds')::interval)
            )
        AND expires_at > now()
      RETURNING id, merchant_id, amount_fils, reference, reservation_id`,
    [input.token, config.paymentLinkReservationTimeoutSeconds],
  );

  const claimedRow = claimResult.rows[0];
  if (!claimedRow) {
    return classifyClaimFailure(pool, input.token, config.paymentLinkReservationTimeoutSeconds, expiryReferenceTime());
  }

  const link = {
    id: claimedRow.id,
    merchantId: claimedRow.merchant_id,
    amountFils: toFils(Number(claimedRow.amount_fils)),
    reference: claimedRow.reference,
  };

  // Step 2 — authorize.
  // am: keys include link.id so two links can never collide on idempotency. good
  const authorizeKey = `paylink:${link.id}:${input.idempotencyKey}:authorize`;
  const authResult = await authorizeTransaction(pool, acquirer, {
    merchantId: link.merchantId,
    amountFils: link.amountFils,
    card: input.card,
    reference: link.reference ?? undefined,
    idempotencyKey: authorizeKey,
    // No merchant session/API key initiated this — a customer did, via
    // the public link.
    actor: { type: "system" },
  });

  if (authResult.statusCode !== 201) {
    await releaseReservation(pool, link.id, claimedRow.reservation_id);
    return {
      statusCode: authResult.statusCode,
      body: { stage: "authorize", ...(authResult.body as Record<string, unknown>) },
    };
  }

  const txnId = (authResult.body as { id: string }).id;

  const captureKey = `paylink:${link.id}:${input.idempotencyKey}:capture`;

  // ADR-0013: record the attempt durably before the acquirer can move money.
  // From here the link cannot be re-claimed, even after a crash, until the
  // outcome is known. Zero rows means a newer claim replaced this one.
  const attempt = await pool.query(
    `UPDATE payment_links
        SET capture_attempt_at = now(), capture_attempt_transaction_id = $3, capture_attempt_idempotency_key = $4
      WHERE id = $1 AND status = 'reserved' AND reservation_id = $2`,
    [link.id, claimedRow.reservation_id, txnId, captureKey],
  );
  if (attempt.rowCount === 0) {
    await voidUncapturedAuthorization(pool, txnId, link);
    return { statusCode: 409, body: { stage: "capture", error: "payment_link_attempt_superseded" } };
  }

  // Step 3 — capture the full amount; discount-before-MDR pricing and the
  // link's paid state both commit inside captureTransaction. An exception or
  // a 5xx leaves the outcome unknown, so the attempt stays recorded for review.
  const captureResult = await captureTransaction(pool, acquirer, {
    paymentLinkClaim: { linkId: link.id, reservationId: claimedRow.reservation_id },
    transactionId: txnId,
    merchantId: link.merchantId,
    idempotencyKey: captureKey,
    actor: { type: "system", id: link.id },
  }).catch((error: unknown) => {
    console.error("payment_link_capture_outcome_unknown", { linkId: link.id, transactionId: txnId });
    throw error;
  });

  // Previously every non-5xx was treated as a refusal; local conflicts can
  // follow a successful remote charge. Only an explicit 402 permits release.
  if (captureResult.statusCode !== 200 && captureResult.statusCode !== 402) {
    console.error("payment_link_capture_outcome_unknown", { linkId: link.id, transactionId: txnId, statusCode: captureResult.statusCode });
    return {
      statusCode: captureResult.statusCode,
      body: { stage: "capture", ...(captureResult.body as Record<string, unknown>) },
    };
  }

  if (captureResult.statusCode !== 200) {
    // A definite refusal: no money moved, so return the authorization and the link.
    const voided = await voidTransaction(pool, {
      transactionId: txnId, merchantId: link.merchantId, actor: { type: "system", id: link.id },
      paymentLinkClaim: { linkId: link.id, reservationId: claimedRow.reservation_id },
    });
    if (voided.statusCode !== 200) return { statusCode: 409, body: { error: "capture_outcome_still_unknown" } };
    await releaseReservation(pool, link.id, claimedRow.reservation_id);
    return {
      statusCode: captureResult.statusCode,
      body: { stage: "capture", ...(captureResult.body as Record<string, unknown>) },
    };
  }

  // Normally capture already marked the link paid. A replayed capture from an
  // attempt that crashed before that existed finalizes here, under this claim.
  const finalizeResult = await pool.query<{ paid_at: Date }>(
    `UPDATE payment_links
        SET status = 'paid', paid_at = COALESCE(paid_at, now()), transaction_id = $2, reserved_at = NULL,
            capture_attempt_at = NULL, capture_attempt_transaction_id = NULL, capture_attempt_idempotency_key = NULL
      WHERE id = $1 AND (status = 'paid' AND transaction_id = $2 OR status = 'reserved' AND reservation_id = $3)
      RETURNING paid_at`,
    [link.id, txnId, claimedRow.reservation_id],
  );

  const finalized = finalizeResult.rows[0];
  if (!finalized) {
    // The acquirer capture succeeded and money moved, so the buyer must not be
    // told the payment failed. A link that cannot record it is a data defect.
    console.error(
      `payPaymentLink: finalize matched 0 rows for link ${link.id} after a successful capture ` +
        `(transaction ${txnId}) — invariant violation, investigate`,
    );
    return {
      statusCode: 200,
      body: { status: "paid", transactionId: txnId, amountFils: link.amountFils, paidAt: new Date().toISOString() },
    };
  }

  return {
    statusCode: 200,
    body: {
      status: "paid",
      transactionId: txnId,
      amountFils: link.amountFils,
      paidAt: finalized.paid_at.toISOString(),
    },
  };
}

/** Voids an authorization this attempt will never capture, releasing its hold.
 *  A failure is logged: the caller's response must not depend on it. */
async function voidUncapturedAuthorization(
  pool: Pool,
  transactionId: string,
  link: { id: string; merchantId: string },
): Promise<void> {
  try {
    await voidTransaction(pool, { transactionId, merchantId: link.merchantId, actor: { type: "system", id: link.id } });
  } catch (err) {
    console.error(`payPaymentLink: could not void authorization ${transactionId} for link ${link.id}`, err);
  }
}

/**
 * Used by the definite-refusal branches above. Guarded by `status =
 * 'reserved'` for the same reason as the finalize UPDATE: this request
 * only ever releases the reservation it itself holds.
 */
async function releaseReservation(pool: Pool, linkId: string, reservationId: string): Promise<void> {
  await pool.query(`UPDATE payment_links SET status = 'active', reserved_at = NULL, reservation_id = NULL, capture_attempt_at = NULL, capture_attempt_transaction_id = NULL, capture_attempt_idempotency_key = NULL WHERE id = $1 AND status = 'reserved' AND reservation_id = $2`, [
    linkId, reservationId,
  ]);
}

/**
 * The claim UPDATE matched 0 rows. This second read carries no race risk —
 * nothing further is decided from it, it only explains a decision already
 * made by the failed UPDATE.
 */
async function classifyClaimFailure(
  pool: Pool,
  token: string,
  reservationTimeoutSeconds: number,
  expiryCheckTime: Date,
): Promise<PayPaymentLinkResult> {
  const result = await pool.query<LinkStatusRow>(`SELECT status, expires_at FROM payment_links WHERE token = $1`, [
    token,
  ]);
  const row = result.rows[0];

  if (!row) {
    return { statusCode: 404, body: { error: "payment_link_not_found" } };
  }
  if (row.status === "paid") {
    return { statusCode: 409, body: { error: "payment_link_already_paid" } };
  }
  if (row.status === "canceled") {
    return { statusCode: 409, body: { error: "payment_link_canceled" } };
  }
  if (row.status === "active" && row.expires_at.getTime() <= expiryCheckTime.getTime()) {
    return { statusCode: 410, body: { error: "payment_link_expired" } };
  }
  if (row.status === "reserved") {
    // A concurrent claim attempt raced us and won between our own UPDATE's
    // failure and this SELECT. It's still within the timeout (if it
    // weren't, our claim UPDATE would have matched it) — reachable only in
    // a genuine race, not a stale read.
    return { statusCode: 409, body: { error: "payment_link_processing" } };
  }
  // Defensive fallback, should be unreachable given the claim UPDATE's
  // WHERE clause exactly mirrors these cases.
  return { statusCode: 409, body: { error: "payment_link_not_payable", status: row.status } };
}
