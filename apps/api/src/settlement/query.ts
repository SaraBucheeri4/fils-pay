import type { Pool } from "pg";
import { BadRequestError } from "../lib/errors.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface SettlementBatchDto {
  id: string;
  batchDate: string;
  status: string;
  grossFils: number;
  feeFils: number;
  netPayoutFils: number;
  closedAt: string | null;
  paidAt: string | null;
}

/** batch_date is a DATE; pg parses it in the process's local timezone (see toBatchDateString). */
interface SettlementBatchRow {
  id: string;
  batch_date: Date;
  status: string;
  gross_fils: string | number;
  fee_fils: string | number;
  net_payout_fils: string | number;
  closed_at: Date | null;
  paid_at: Date | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toBatchDateString(d: Date): string {
  // batch_date is a plain DATE column with no timezone of its own. The
  // `pg` driver parses a DATE value using the *process's local* timezone
  // (`new Date(year, month - 1, day)`, not `Date.UTC(...)`), so `.
  // toISOString()` (which always renders in UTC) can shift the calendar
  // date by one day whenever the process's local timezone isn't UTC —
  // exactly the kind of subtle bug this platform's money/date paths must
  // not have. Reading the Date's own *local* year/month/day getters
  // instead always recovers exactly the calendar date `pg` parsed,
  // regardless of the process's local timezone.
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Maps a settlement_batches row to its DTO. Under ADR-0010 netPayoutFils is
 * max(0, grossFils - feeFils + carry), not simply grossFils - feeFils.
 */
function serializeBatch(row: SettlementBatchRow): SettlementBatchDto {
  return {
    id: row.id,
    batchDate: toBatchDateString(row.batch_date),
    status: row.status,
    grossFils: Number(row.gross_fils),
    feeFils: Number(row.fee_fils),
    netPayoutFils: Number(row.net_payout_fils),
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
  };
}

export interface ListSettlementBatchesFilters {
  merchantId: string;
  from?: Date;
  to?: Date;
  status?: string[];
  limit?: number;
  cursor?: string | null;
}

export interface ListSettlementBatchesResult {
  batches: SettlementBatchDto[];
  nextCursor: string | null;
}

interface DecodedCursor {
  batchDate: string;
  id: string;
}

function decodeCursor(cursor: string | null | undefined): DecodedCursor | null {
  if (!cursor) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf("|");
  if (separatorIndex === -1) return null;
  const batchDate = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  if (!batchDate || !id) return null;
  return { batchDate, id };
}

function encodeCursor(batchDate: Date, id: string): string {
  return Buffer.from(`${toBatchDateString(batchDate)}|${id}`, "utf8").toString("base64url");
}

/**
 * `GET /v1/settlement/batches` business logic. Keyset pagination, same
 * pattern as `listTransactions`.
 */
// am: batch_date < to is exclusive, same as API.md. matches the Go side
export async function listSettlementBatches(
  pool: Pool,
  filters: ListSettlementBatchesFilters,
): Promise<ListSettlementBatchesResult> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
  const statusArray = filters.status && filters.status.length > 0 ? filters.status : null;
  const decodedCursor = decodeCursor(filters.cursor);

  const result = await pool.query<SettlementBatchRow>(
    `SELECT id, batch_date, status, gross_fils, fee_fils, net_payout_fils, closed_at, paid_at
       FROM settlement_batches
      WHERE merchant_id = $1
        AND ($2::date IS NULL OR batch_date >= $2)
        AND ($3::date IS NULL OR batch_date <  $3)
        AND ($4::text[] IS NULL OR status = ANY($4))
        AND ($5::date IS NULL OR (batch_date, id) < ($5, $6))
      ORDER BY batch_date DESC, id DESC
      LIMIT $7`,
    [
      filters.merchantId,
      filters.from ?? null,
      filters.to ?? null,
      statusArray,
      decodedCursor?.batchDate ?? null,
      decodedCursor?.id ?? null,
      limit,
    ],
  );

  const batches = result.rows.map(serializeBatch);
  const lastRow = result.rows[result.rows.length - 1];
  const nextCursor = result.rows.length === limit && lastRow ? encodeCursor(lastRow.batch_date, lastRow.id) : null;

  return { batches, nextCursor };
}

export interface SettlementBatchDetailDto extends SettlementBatchDto {
  /** Count of distinct transactions included in this batch's scheme
   *  export (scheme_export_lines rows — one per included transaction, by
   *  construction). */
  includedTransactionCount: number;
  /** Count of capture-type transaction_events rows this batch consumed.
   *  Can exceed includedTransactionCount — a transaction captured twice
   *  within the batch window contributes one scheme_export_lines row but
   *  two transaction_events rows. */
  includedEventCount: number;
}

/**
 * `GET /v1/settlement/batches/:id` business logic. 404, not 403, on an
 * ownership mismatch — same as the transaction detail read: a 403 would
 * confirm a batch with that ID exists (just not theirs).
 */
export async function getSettlementBatch(
  pool: Pool,
  input: { merchantId: string; batchId: string },
): Promise<SettlementBatchDetailDto | null> {
  const batchResult = await pool.query<SettlementBatchRow>(
    `SELECT id, batch_date, status, gross_fils, fee_fils, net_payout_fils, closed_at, paid_at
       FROM settlement_batches WHERE id = $1 AND merchant_id = $2`,
    [input.batchId, input.merchantId],
  );
  const row = batchResult.rows[0];
  if (!row) return null;

  const [txnCountResult, eventCountResult] = await Promise.all([
    pool.query<{ count: string }>(`SELECT count(*) FROM scheme_export_lines WHERE settlement_batch_id = $1`, [
      input.batchId,
    ]),
    pool.query<{ count: string }>(`SELECT count(*) FROM transaction_events WHERE settlement_batch_id = $1`, [
      input.batchId,
    ]),
  ]);

  return {
    ...serializeBatch(row),
    includedTransactionCount: Number(txnCountResult.rows[0]?.count ?? 0),
    includedEventCount: Number(eventCountResult.rows[0]?.count ?? 0),
  };
}

/**
 * schemeAmountFils: the amount the scheme export line carries (truncated
 * to whole 10-fils units). capturedFils: the untruncated captured total.
 */
export interface SettlementBatchTransactionDto {
  transactionId: string;
  schemeAmountFils: number;
  lineSequence: number;
  reference: string | null;
  status: string;
  authorizedFils: number;
  capturedFils: number;
}

interface SettlementBatchTransactionRow {
  transaction_id: string;
  scheme_amount_fils: string | number;
  line_sequence: number;
  reference: string | null;
  status: string;
  authorized_fils: string | number;
  captured_fils: string | number;
}

/**
 * `GET /v1/settlement/batches/:id/transactions` business logic.
 * Same 404-on-ownership-mismatch check as `getSettlementBatch`, performed
 * by the caller (routes/settlement.ts) before this is called. Reads from
 * scheme_export_lines (many, but exactly-one-per-transaction by
 * construction) joined -> transactions (one) — the safe join direction.
 */
// unbounded but a batch is one merchant one day, max a few thousand lines — am
export async function listBatchTransactions(
  pool: Pool,
  batchId: string,
): Promise<SettlementBatchTransactionDto[]> {
  const result = await pool.query<SettlementBatchTransactionRow>(
    `SELECT sel.transaction_id, sel.amount_fils AS scheme_amount_fils, sel.line_sequence,
            t.reference, t.status, t.amount_fils AS authorized_fils, t.captured_fils
       FROM scheme_export_lines sel
       JOIN transactions t ON t.id = sel.transaction_id
      WHERE sel.settlement_batch_id = $1
      ORDER BY sel.line_sequence`,
    [batchId],
  );

  return result.rows.map((row) => ({
    transactionId: row.transaction_id,
    schemeAmountFils: Number(row.scheme_amount_fils),
    lineSequence: row.line_sequence,
    reference: row.reference,
    status: row.status,
    authorizedFils: Number(row.authorized_fils),
    capturedFils: Number(row.captured_fils),
  }));
}

/**
 * gapFils = ledgerMerchantPayableNetFils - settlementNetPayoutFils -
 * pendingUnbatchedFils. Amounts are attributed to the original activity
 * window, including refunds and fee corrections, whether claimed or pending.
 */
export interface ReconciliationReport {
  periodFrom: string;
  periodTo: string;
  ledgerMerchantPayableNetFils: number;
  settlementNetPayoutFils: number;
  pendingUnbatchedFils: number;
  gapFils: number;
  explained: boolean;
}

/** Fixed UTC+3 midnight for a Bahrain business-day boundary. */
function bahrainLocalMidnightUtc(dateStr: string): Date {
  const parsed = new Date(`${dateStr}T00:00:00+03:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`bahrainLocalMidnightUtc: invalid date "${dateStr}"`);
  }
  return parsed;
}

/** `GET /v1/settlement/reconciliation` business logic. */
/**
 * @param input.from  inclusive business date (YYYY-MM-DD)
 * @param input.to    exclusive business date (YYYY-MM-DD)
 * @returns explained === true iff gapFils === 0. Capture fee snapshots
 *          preserve the actual historical schedule, discount and tier.
 */
export async function getReconciliationReport(
  pool: Pool,
  input: { merchantId: string; from: string; to: string },
): Promise<ReconciliationReport> {
  const windowStart = bahrainLocalMidnightUtc(input.from);
  const windowEnd = bahrainLocalMidnightUtc(input.to);

  // One SQL snapshot attributes both batched and pending amounts to their
  // original Bahrain activity window. Payout legs discharge these accruals;
  // they must not subtract the same obligation a second time here.
  const result = await pool.query<{ ledger: string; settled: string; pending: string }>(
    `WITH activity AS (
       SELECT te.amount_fils - COALESCE((te.metadata->>'feeFils')::bigint,
         (SELECT COALESCE(SUM(CASE WHEN fee.direction = 'credit' THEN fee.amount_fils ELSE -fee.amount_fils END), 0)
          FROM ledger_entries fee
          WHERE fee.transaction_id = te.transaction_id AND fee.account_id = 'platform_fee_revenue'
            AND fee.occurred_at = te.occurred_at AND fee.description NOT LIKE 'refund:%')) AS net,
         te.settlement_batch_id AS batch_id
       FROM transaction_events te JOIN transactions t ON t.id = te.transaction_id
       WHERE t.merchant_id = $1 AND te.event_type IN ('captured', 'partially_captured')
         AND te.occurred_at >= $2 AND te.occurred_at < $3
       UNION ALL
       -- Historical discounts were separate payable credits. Include the
       -- actual posting rather than estimating it at today's merchant rate.
       SELECT le.amount_fils, latest.settlement_batch_id
       FROM ledger_entries le
       LEFT JOIN LATERAL (SELECT te.settlement_batch_id FROM transaction_events te
         WHERE te.transaction_id = le.transaction_id AND te.event_type IN ('captured','partially_captured')
         ORDER BY te.occurred_at DESC, te.id DESC LIMIT 1) latest ON true
       WHERE le.merchant_id = $1 AND le.account_id = 'merchant_payable' AND le.direction = 'credit'
         AND le.description = 'capture: negotiated discount adjustment'
         AND le.occurred_at >= $2 AND le.occurred_at < $3
       UNION ALL
       SELECT -amount_fils + fee_reversed_fils, settlement_batch_id FROM refunds
        WHERE merchant_id = $1 AND status = 'succeeded' AND occurred_at >= $2 AND occurred_at < $3
       UNION ALL
       SELECT -c.fee_delta_fils, c.settlement_batch_id FROM settlement_fee_corrections c
        JOIN settlement_batches source ON source.id = c.source_batch_id
        WHERE c.merchant_id = $1
          AND source.batch_date >= ($2::timestamptz AT TIME ZONE 'Asia/Bahrain')::date
          AND source.batch_date < ($3::timestamptz AT TIME ZONE 'Asia/Bahrain')::date
     )
     SELECT
       (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END), 0)
        FROM ledger_entries WHERE merchant_id = $1 AND account_id = 'merchant_payable'
          AND occurred_at >= $2 AND occurred_at < $3
          AND COALESCE(description, '') NOT LIKE 'settlement payout:%')::text AS ledger,
       COALESCE(SUM(net) FILTER (WHERE batch_id IS NOT NULL), 0)::text AS settled,
       COALESCE(SUM(net) FILTER (WHERE batch_id IS NULL), 0)::text AS pending
     FROM activity`, [input.merchantId, windowStart, windowEnd]);
  const row = result.rows[0]!;
  const ledgerMerchantPayableNetFils = Number(row.ledger);
  const settlementNetPayoutFils = Number(row.settled);
  const pendingUnbatchedFils = Number(row.pending);

  const gapFils = ledgerMerchantPayableNetFils - settlementNetPayoutFils - pendingUnbatchedFils;

  return {
    periodFrom: input.from,
    periodTo: input.to,
    ledgerMerchantPayableNetFils,
    settlementNetPayoutFils,
    pendingUnbatchedFils,
    gapFils,
    explained: gapFils === 0,
  };
}

export interface BatchIntegrityMismatch {
  batchId: string;
  batchDate: string;
  actual: { grossFils: number; feeFils: number; netPayoutFils: number };
  expected: { grossFils: number; feeFils: number; netPayoutFils: number };
  accountingMismatch: boolean;
}

/**
 * Separate from reconciliation, which ADR-0010 keeps attributing activity to
 * its original window: checks each closed batch's frozen totals against the
 * activity it claimed, using the fees actually journaled. Whole-transaction
 * fees include legacy discount legs once, matching close; fallback fees are
 * now journaled and snapshotted atomically instead of existing only in totals.
 * A batch that paid the wrong amount shows here even when reconciliation has no gap.
 */
export async function getBatchIntegrityReport(
  pool: Pool,
  input: { merchantId: string; from: string; to: string },
): Promise<{ periodFrom: string; periodTo: string; batchesChecked: number; mismatches: BatchIntegrityMismatch[] }> {
  // Missing validation previously turned malformed dates into database 500s.
  // Round-trip each calendar date and reject empty/reversed windows before SQL.
  for (const date of [input.from, input.to]) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-") || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new BadRequestError("invalid_request", "from and to must be valid YYYY-MM-DD dates");
    }
  }
  if (input.from >= input.to) throw new BadRequestError("invalid_request", "to must be after from");
  const result = await pool.query<{
    id: string; batch_date: Date; gross_fils: string; fee_fils: string; net_payout_fils: string;
    expected_gross: string; expected_fee: string; expected_net: string; accounting_mismatch: boolean;
  }>(
    `WITH batches AS (
       SELECT * FROM settlement_batches
        WHERE merchant_id = $1 AND status <> 'open' AND batch_date >= $2::date AND batch_date < $3::date
     ), claimed AS (
       SELECT b.id,
         COALESCE((SELECT SUM(te.amount_fils) FROM transaction_events te
           WHERE te.settlement_batch_id = b.id AND te.event_type IN ('captured','partially_captured')), 0)
         - COALESCE((SELECT SUM(r.amount_fils) FROM refunds r
           WHERE r.settlement_batch_id = b.id AND r.status = 'succeeded'), 0) AS gross,
         COALESCE((SELECT SUM(CASE
           WHEN (SELECT COUNT(*) FROM transaction_events all_te WHERE all_te.transaction_id = tx.transaction_id
             AND all_te.event_type IN ('captured','partially_captured')) = tx.event_count
           THEN (SELECT COALESCE(SUM(CASE WHEN l.direction = 'credit' THEN l.amount_fils ELSE -l.amount_fils END),0)
             FROM ledger_entries l WHERE l.transaction_id = tx.transaction_id
               AND l.account_id = 'platform_fee_revenue' AND l.description LIKE 'capture%')
           ELSE (SELECT SUM(COALESCE((te.metadata->>'feeFils')::bigint,
             (SELECT COALESCE(SUM(CASE WHEN l.direction = 'credit' THEN l.amount_fils ELSE -l.amount_fils END),0)
               FROM ledger_entries l WHERE l.transaction_id = te.transaction_id
                 AND l.account_id = 'platform_fee_revenue' AND l.occurred_at = te.occurred_at
                 AND l.description LIKE 'capture%')))
             FROM transaction_events te WHERE te.transaction_id = tx.transaction_id
               AND te.settlement_batch_id = b.id AND te.event_type IN ('captured','partially_captured')) END)
           FROM (SELECT transaction_id, COUNT(*) AS event_count FROM transaction_events
             WHERE settlement_batch_id = b.id AND event_type IN ('captured','partially_captured')
             GROUP BY transaction_id) tx),0)
         - COALESCE((SELECT SUM(r.fee_reversed_fils) FROM refunds r
           WHERE r.settlement_batch_id = b.id AND r.status = 'succeeded'), 0)
         + COALESCE((SELECT SUM(c.fee_delta_fils) FROM settlement_fee_corrections c
           WHERE c.settlement_batch_id = b.id), 0) AS fee
       FROM batches b
     )
     SELECT b.id, b.batch_date, b.gross_fils, b.fee_fils, b.net_payout_fils,
            c.gross::text AS expected_gross, c.fee::text AS expected_fee,
            GREATEST(0, c.gross - c.fee + b.carry_in_fils)::text AS expected_net,
            EXISTS (SELECT 1 FROM transaction_events claimed_te
              WHERE claimed_te.settlement_batch_id = b.id AND claimed_te.event_type IN ('captured','partially_captured')
              AND (SELECT COALESCE(SUM(te.amount_fils),0) FROM transaction_events te
                WHERE te.transaction_id = claimed_te.transaction_id AND te.event_type IN ('captured','partially_captured'))
              <> (SELECT COALESCE(SUM(CASE WHEN l.direction = 'debit' THEN l.amount_fils ELSE -l.amount_fils END),0)
                FROM ledger_entries l WHERE l.transaction_id = claimed_te.transaction_id
                  AND l.account_id = 'card_scheme_clearing' AND l.description LIKE 'capture%')) AS accounting_mismatch
       FROM batches b JOIN claimed c USING (id)
      ORDER BY b.batch_date, b.id`,
    [input.merchantId, input.from, input.to],
  );
  const mismatches: BatchIntegrityMismatch[] = [];
  for (const row of result.rows) {
    const actual = { grossFils: Number(row.gross_fils), feeFils: Number(row.fee_fils), netPayoutFils: Number(row.net_payout_fils) };
    const expected = { grossFils: Number(row.expected_gross), feeFils: Number(row.expected_fee), netPayoutFils: Number(row.expected_net) };
    // Totals alone could certify a batch whose capture journal never existed.
    // Keep that accounting defect visible even when the arithmetic agrees.
    if (row.accounting_mismatch || actual.grossFils !== expected.grossFils || actual.feeFils !== expected.feeFils || actual.netPayoutFils !== expected.netPayoutFils) {
      mismatches.push({ batchId: row.id, batchDate: toBatchDateString(row.batch_date), actual, expected, accountingMismatch: row.accounting_mismatch });
    }
  }
  return { periodFrom: input.from, periodTo: input.to, batchesChecked: result.rows.length, mismatches };
}

export interface SettlementSummaryDto {
  periodFrom: string;
  periodTo: string;
  transactionCount: number;
  totalCapturedFils: number;
  /** Refunds in the same Bahrain window; capture totals stay gross. */
  totalRefundedFils: number;
}

interface SettlementSummaryRow {
  transaction_count: string;
  total_captured_fils: string | number | null;
  total_refunded_fils: string | number | null;
}

/** Gross captured in window, joined through transaction_events for batch parity. */
export async function getSettlementSummary(
  pool: Pool,
  input: { merchantId: string; from: string; to: string },
): Promise<SettlementSummaryDto> {
  const windowStart = bahrainLocalMidnightUtc(input.from);
  const windowEnd = bahrainLocalMidnightUtc(input.to);

  const result = await pool.query<SettlementSummaryRow>(
    `WITH captured AS (
       SELECT t.id, te.amount_fils AS captured_fils
         FROM transactions t
         JOIN transaction_events te ON te.transaction_id = t.id
        WHERE t.merchant_id = $1
          AND te.event_type IN ('captured', 'partially_captured')
          AND te.occurred_at >= $2 AND te.occurred_at < $3
     )
     SELECT COUNT(DISTINCT id) AS transaction_count,
            COALESCE(SUM(captured_fils), 0) AS total_captured_fils,
            (SELECT COALESCE(SUM(amount_fils), 0) FROM refunds
              WHERE merchant_id = $1 AND status = 'succeeded'
                AND occurred_at >= $2 AND occurred_at < $3) AS total_refunded_fils
       FROM captured`,
    [input.merchantId, windowStart, windowEnd],
  );

  const row = result.rows[0];
  return {
    periodFrom: input.from,
    periodTo: input.to,
    transactionCount: Number(row?.transaction_count ?? 0),
    totalCapturedFils: Number(row?.total_captured_fils ?? 0),
    totalRefundedFils: Number(row?.total_refunded_fils ?? 0),
  };
}
