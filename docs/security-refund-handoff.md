# Security/reporting handoff, 2026-10-30

Ownership: this work reserves migrations 0090–0099 and changes Go only in
`internal/settlement/payout_notify.go`. No changes to batch.go, refund
processing, capture accounting, settlement calculations, reconciliation or
transaction serialization are included.

B16 consumes the existing producer contract in processRefund.ts:
`refund.succeeded`, aggregateType `transaction`, aggregateId transaction UUID;
payload `{merchantId, refundId, amountFils, feeReversedFils,
refundedTotalFils, newStatus}`. Amounts are integer fils. The outbox row is
created atomically with the succeeded refund. Its created_at instant buckets
refund activity in Asia/Bahrain; retries must not emit another business event.

The public envelope maps those fields explicitly, adds transactionId, uses
status `succeeded` and maps newStatus to transactionStatus. Delivery uses the
same signed-byte, SSRF-safe transport and cross-worker claim as other events.
Reporting applies amountFils once under durable receipts, including late
commits, and rebuilds preserve the same Bahrain date bucket.

The owner confirmed on 2026-10-30 that the current implementations are shared
universally; this existing producer contract is therefore the coordination
baseline, with no separate acknowledgement outstanding. Future producer changes
must preserve it or update the envelope and consumer together. The public refund
route remains disabled. This consumer/delivery work does not resolve refund
authorization, cumulative fee reversal, settlement adjustment or reconciliation
release blockers.

Payout notification scans write one payout record per paid positive-net batch
independently of subscribers, in the scan transaction; batch.go was not edited.
If immediate recording inside the bank-instruction transaction is required,
the friend must coordinate that change and retain the per-batch uniqueness key.

## Finance producer integration, 2026-10-30

The finance changes preserve the six existing refund payload fields and
transaction aggregate identity. The refund, journal, timeline, idempotency
response and outbox event now commit together under the transaction lock.
Fee reversal allocates the remaining historically charged net fee over the
remaining captured funds; the final refund returns every remaining fee fil.
Legacy discount debit legs are included. Capture pricing applies discount
before MDR atomically for both checkout and merchant capture.

Settlement claims succeeded `refunds` and pending `settlement_fee_corrections`
rows directly from the shared database, inside CloseBatch. It does not require
a best-effort HTTP notification or a second refund journal. Amounts remain
integer fils. ADR-0009 records explicit merchant opt-in; ADR-0010 records
negative-net carry. Batch corrections remain separate approved financial
adjustments rather than retroactive mutations of capture pricing snapshots.

No delivery, envelope, reporting-consumer or payout_notify.go edits were made
by the finance owner. The release remains gated on disposable-database
verification, including consumer/delivery compatibility; the public refund
route is wired behind FEATURE_REFUNDS (default false), and the drawer remains
disabled until that evidence is available. The added configuration field
preserves the teammate configuration edits.
