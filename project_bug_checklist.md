# FilsPay project bug checklist

Source: [bugs.md](bugs.md). Prepared 2026-10-29. Duplicate reports are consolidated; distinct export problems are split for tracking. All items start unchecked. This is a remediation plan based on source inspection, not proof of runtime reproduction or a complete security audit.

Mark an item complete only when the fix and its dependent behavior have been verified. Integration decisions are tracked separately from confirmed implementation defects. No production-data repair is authorized by this checklist.

## Working rules

- Money amounts must remain whole fils; no floating-point money calculations. Resolve existing decimal input/export contracts explicitly rather than silently changing units.
- Daily settlement starts at midnight Asia/Bahrain (UTC+3), closing the completed business day.
- Direct docs/*.md files are the requested source of truth. ADRs guide future changes; conflicting policies are called out below rather than silently resolved.
- Respect existing money-package and test-file freezes. Identify any approval or policy change needed before implementation; a test preserving a bug must not dictate incorrect business behavior.
- Check migration deployment history before changing existing migration files. Fresh-install and upgrade paths both need validation.

## Fix order and dependencies

1. Startup: B01–B06. B02 must be repaired before the migration runner can reach B03.
2. Access and isolation: B32–B35, B23, B17–B18 and B31. Coordinate OTP enforcement with B09.
3. Money correctness: B10–B15, B20–B21 and B25–B30. Validate ledger/report effects together.
4. Activate refunds (B16) only after its safeguards and downstream consumers work. Live processing/payouts (B07–B08) require explicit product scope and provider integration.
5. Notifications and scale: B19, B22, B24 and B36–B39. Fix B38 before switching exports to the existing streaming helper.

Dependencies below include both strict prerequisites and changes that must be coordinated; they are not all blockers for starting investigation.

## Checklist

- [ ] **B01 — Docker application builds reference missing files**

**Category:** Startup blocker.

**Summary and business impact:** Compose references Dockerfiles absent from the repository, so the documented container setup cannot build the applications.

**Code references:** [ops/docker-compose.yml](ops/docker-compose.yml), [ops/README.md](ops/README.md).

**Suggested fixes:** Add reproducible Node and Go Dockerfiles, or document running apps locally with only Postgres in Docker. Explicitly wire environment settings and order migration/seed jobs.

**Why this approach:** Makes the documented setup reproducible rather than dependent on files on an individual developer's machine.

**Dependencies / verification:** B02–B05; cannot run Docker is a broad report: confirm any Docker Desktop/engine error separately.

- [ ] **B02 — Migration 0054 references a nonexistent table**

**Category:** Startup blocker.

**Summary and business impact:** The unbatched-capture view references settlement_batch_events, which migrations do not create. Fresh database setup stops.

**Code references:** [db/migrations/0054_views.sql](db/migrations/0054_views.sql), [db/migrations/0023_transaction_events_settlement_batch.sql](db/migrations/0023_transaction_events_settlement_batch.sql), [db/migrate.ts](db/migrate.ts).

**Suggested fixes:** Use transaction_events.settlement_batch_id IS NULL and include both full and partial capture events. Check deployment history before choosing a safe repair for the migration chain.

**Why this approach:** Uses the schema the application actually writes and preserves eligibility for partial captures.

**Dependencies / verification:** B03 follows this migration. Verify a complete fresh migration and an upgrade from an existing schema.

- [ ] **B03 — Migration 0055 uses nonexistent account columns**

**Category:** Startup blocker.

**Summary and business impact:** The migration inserts code, account_type and description into a chart_of_accounts table defined with id, name and kind. Database setup cannot finish.

**Code references:** [db/migrations/0055_chart_of_accounts_suspense.sql](db/migrations/0055_chart_of_accounts_suspense.sql), [db/migrations/0007_ledger_double_entry.sql](db/migrations/0007_ledger_double_entry.sql), [db/migrate.ts](db/migrate.ts).

**Suggested fixes:** Align the insert with actual columns and permitted account kinds. Confirm the intended accounting classification and migration history before repairing the upgrade path.

**Why this approach:** Fixes the schema mismatch without inventing incompatible accounts or bypassing migration tracking.

**Dependencies / verification:** B02. Validate fresh installation and upgrades; do not silently modify migrations already applied elsewhere.

- [ ] **B04 — Development encryption-key fallback has the wrong length**

**Category:** Startup blocker.

**Summary and business impact:** The fallback decodes to 34 bytes but AES-256-GCM configuration requires 32. API startup and seed configuration fail without an explicit valid key.

**Code references:** [apps/api/src/config.ts](apps/api/src/config.ts), [apps/api/src/webhooks/secretCrypto.ts](apps/api/src/webhooks/secretCrypto.ts), [db/seed/generate.ts](db/seed/generate.ts), [ops/docker-compose.yml](ops/docker-compose.yml).

**Suggested fixes:** Provision a persistent random 32-byte key encoded as Base64. Repair development provisioning and setup documentation; retain strict validation and never silently replace an existing encryption key.

**Why this approach:** Allows startup while keeping stored webhook secrets decryptable across restarts.

**Dependencies / verification:** B01. Existing encrypted secrets require the original key or an explicit migration/rotation procedure.

- [ ] **B05 — Settlement internal token is not supplied by Compose**

**Category:** Startup blocker.

**Summary and business impact:** The daemon requires an internal token, but Compose does not supply one. Settlement cannot start as documented, and the API must use the matching token.

**Code references:** [ops/docker-compose.yml](ops/docker-compose.yml), [apps/settlement/internal/config/config.go](apps/settlement/internal/config/config.go), [apps/settlement/cmd/settlement/main.go](apps/settlement/cmd/settlement/main.go), [apps/api/src/config.ts](apps/api/src/config.ts).

**Suggested fixes:** Explicitly supply the same token to API and settlement and use the correct internal URL for local versus container execution.

**Why this approach:** Restores authenticated communication without weakening the internal API's access control.

**Dependencies / verification:** B01. Verify daemon startup and an authenticated API-to-settlement request.

- [ ] **B06 — Browser apps cannot reach the API with current origin configuration**

**Category:** Browser blocker.

**Summary and business impact:** The dashboards run on different ports from the API, with no matching API CORS registration or Vite proxy. Login and data requests can fail in the browser.

**Code references:** [apps/web/vite.config.ts](apps/web/vite.config.ts), [apps/admin/vite.config.ts](apps/admin/vite.config.ts), [apps/web/src/api/client.ts](apps/web/src/api/client.ts), [apps/admin/src/api/client.ts](apps/admin/src/api/client.ts), [apps/api/src/app.ts](apps/api/src/app.ts).

**Suggested fixes:** For development, proxy /v1 to the API and configure relative frontend API URLs. For separate deployed origins, explicitly configure allowed origins and credentialed CORS.

**Why this approach:** Provides a consistent browser connection path while retaining cookie authentication.

**Dependencies / verification:** B04 and B32. Test both dashboards through password and OTP login, not just API health.

- [ ] **B07 — Card processing uses only a simulator**

**Category:** Integration decision.

**Summary and business impact:** The API always constructs a simulator; approvals do not represent real card processing. This is a live-launch gap, not necessarily a defect for a demo.

**Code references:** [apps/api/src/app.ts](apps/api/src/app.ts), [apps/api/src/acquirer/simulator.ts](apps/api/src/acquirer/simulator.ts), [apps/api/src/acquirer/types.ts](apps/api/src/acquirer/types.ts).

**Suggested fixes:** Decide whether the target is a demo or live payments. For live use, add a provider adapter with stable idempotency, timeout recovery and callback verification; retain an explicit simulator mode.

**Why this approach:** Keeps demonstrations deterministic and prevents simulated approvals being mistaken for live payments.

**Dependencies / verification:** B17–B23. Requires a provider contract; do not mark live-ready from simulator tests.

- [ ] **B08 — Paid batch status does not represent a confirmed bank transfer**

**Category:** Integration decision.

**Summary and business impact:** Payout code posts ledger entries and marks batches paid without initiating or confirming a bank transfer. The business cannot treat that status as evidence of disbursement.

**Code references:** [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [apps/settlement/internal/splits/allocate.go](apps/settlement/internal/splits/allocate.go), [apps/settlement/internal/settlement/payout_notify.go](apps/settlement/internal/settlement/payout_notify.go), [apps/api/src/webhooks/payoutDisbursement.ts](apps/api/src/webhooks/payoutDisbursement.ts).

**Suggested fixes:** For live payouts, add a durable payout instruction and provider/manual-confirmation workflow. Mark paid only on authoritative confirmation; make retries and ledger posting idempotent.

**Why this approach:** Separates money owed, transfer requested and transfer completed, preventing false payout confirmations.

**Dependencies / verification:** B11, B24, B25 and B28. Coordinate ledger, status, reports and notifications; demo-only scope must be explicit.

- [ ] **B09 — OTP delivery is a logging stub**

**Category:** Integration gap.

**Summary and business impact:** No real email or SMS delivery exists. In production the code is not logged, so users cannot complete normal OTP login through a delivery channel.

**Code references:** [apps/api/src/auth/notifier.ts](apps/api/src/auth/notifier.ts), [apps/api/src/adminAuth/notifier.ts](apps/api/src/adminAuth/notifier.ts), [apps/api/src/config.ts](apps/api/src/config.ts).

**Suggested fixes:** Add a notifier adapter for the selected delivery provider with bounded retries and delivery-failure handling. Keep development exposure explicitly restricted to development.

**Why this approach:** Makes two-step login usable without leaking production authentication codes into logs.

**Dependencies / verification:** B32 and B33. Test delivery failure, expiry and resend for merchant and admin accounts.

- [ ] **B10 — Settlement does not close at Bahrain midnight**

**Category:** Business timing.

**Summary and business impact:** The scheduler uses the UTC calendar date when selecting the Bahrain day and adds a default delay. Activity can be assigned or processed on the wrong schedule.

**Code references:** [apps/settlement/internal/scheduler/daemon.go](apps/settlement/internal/scheduler/daemon.go), [apps/settlement/internal/settlement/window.go](apps/settlement/internal/settlement/window.go), [apps/settlement/internal/config/config.go](apps/settlement/internal/config/config.go).

**Suggested fixes:** Derive today in Asia/Bahrain, close the completed local day at 00:00 UTC+3, and use inclusive-start/exclusive-end windows. Remove the intentional delay for the requested rule; recover missed days explicitly.

**Why this approach:** Uses one business calendar independent of host timezone and keeps the midnight cutoff exact even when batch processing takes time.

**Dependencies / verification:** B15, B27 and B39. Audit boundary events and missed dates; a scheduler fix does not repair old closed batches.

- [ ] **B11 — Net payout calculation uses float32 dinars**

**Category:** Money correctness.

**Summary and business impact:** NetPayableFils converts gross and fees to float32 dinars before returning fils. Precision loss can alter money owed to merchants.

**Code references:** [apps/settlement/internal/settlement/payable.go](apps/settlement/internal/settlement/payable.go), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go).

**Suggested fixes:** Calculate net directly as integer gross fils minus integer fee fils, with validated ranges and overflow handling.

**Why this approach:** Subtraction in the authoritative unit preserves every fil without a lossy conversion.

**Dependencies / verification:** B25, B28, B30 and B39. Reconcile changed results; preserve historical paid records and correct discrepancies explicitly.

- [ ] **B12 — CSV adjustment amounts use a two-decimal parser**

**Category:** Money correctness.

**Summary and business impact:** Amounts documented as dinars are converted with a generic two-decimal parser, causing incorrect fils values and lost precision in ledger corrections.

**Code references:** [apps/api/src/admin/adjustmentCsvParsing.ts](apps/api/src/admin/adjustmentCsvParsing.ts), [apps/api/src/lib/decimal.ts](apps/api/src/lib/decimal.ts), [apps/api/src/admin/adjustmentImport.ts](apps/api/src/admin/adjustmentImport.ts), [packages/money/src/fils.ts](packages/money/src/fils.ts).

**Suggested fixes:** Use the existing exact parseBhdToFils helper for the documented legacy dinar-text interface. If imports must accept whole fils only, explicitly version/change the input contract and labels; never silently reinterpret units. Reject unsupported precision.

**Why this approach:** Makes input units explicit and produces whole-fils postings without truncation or floating-point parsing.

**Dependencies / verification:** B13. Audit past imports separately; fixing parsing does not correct existing ledger entries.

- [ ] **B13 — Balance adjustments affect only the cache despite journaled documentation**

**Category:** Accounting policy conflict.

**Summary and business impact:** The active adjustment route updates the cached balance and audit log but not the ledger. Corrections disappear on rebuild and disagree with ADMIN.md; ADR 0006 prescribes cache-only behavior.

**Code references:** [apps/api/src/routes/adminBalanceAdjustments.ts](apps/api/src/routes/adminBalanceAdjustments.ts), [apps/api/src/admin/balanceAdjustments.ts](apps/api/src/admin/balanceAdjustments.ts), [apps/api/src/admin/ledgerAdjustments.ts](apps/api/src/admin/ledgerAdjustments.ts), [docs/ADMIN.md](docs/ADMIN.md), [docs/adr/0006-display-adjustments.md](docs/adr/0006-display-adjustments.md).

**Suggested fixes:** Resolve the documented policy conflict. For actual financial corrections, use balanced journal entries with reasons and effective dates, and update the cache consistently. Label any retained display-only corrections explicitly.

**Why this approach:** Distinguishes a financial correction from a visual override and prevents a rebuild from silently undoing real corrections.

**Dependencies / verification:** B14 and B28. Review existing cache adjustments before migration; do not automatically journal all historical display changes.

- [ ] **B14 — Admin and CLI balance rebuilds use different sources**

**Category:** Accounting correctness / policy conflict.

**Summary and business impact:** The CLI sums merchant-payable ledger entries while the admin path reads a scheme-export-based view. The same merchant can receive different balances.

**Code references:** [apps/settlement/internal/ledger/rebuild.go](apps/settlement/internal/ledger/rebuild.go), [apps/settlement/internal/ledger/refresh.go](apps/settlement/internal/ledger/refresh.go), [apps/settlement/internal/internalapi/server.go](apps/settlement/internal/internalapi/server.go), [db/migrations/0054_views.sql](db/migrations/0054_views.sql), [docs/adr/0004-balance-rebuild-source.md](docs/adr/0004-balance-rebuild-source.md).

**Suggested fixes:** Resolve ADR 0004 versus direct-doc requirements and define one authoritative payable calculation. Reuse the ledger-based calculation for a financial balance; run expensive rebuilds as jobs and protect concurrent updates.

**Why this approach:** A shared accounting definition prevents two supposedly equivalent operations producing different financial answers.

**Dependencies / verification:** B13 first or coordinated. Rebuilds erase cache-only adjustments; compare before/after values and ledger totals before rollout.

- [ ] **B15 — Scheme residue is not posted during batch close**

**Category:** Accounting correctness.

**Summary and business impact:** CloseBatch stores scheme lines but does not journal the integer-fils remainder required by ADR 0002. Ledger and external settlement records cannot reconcile consistently.

**Code references:** [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [apps/settlement/internal/settlement/scheme_export.go](apps/settlement/internal/settlement/scheme_export.go), [db/migrations/0007_ledger_double_entry.sql](db/migrations/0007_ledger_double_entry.sql), [docs/adr/0002-scheme-residue-at-export.md](docs/adr/0002-scheme-residue-at-export.md).

**Suggested fixes:** Calculate residue from gross and the authoritative exported integer amount. Post the ADR's balanced clearing/residue entries atomically with the line, with a stable identity preventing duplicate postings.

**Why this approach:** Ties each difference to its source line and prevents missing or duplicate accounting entries.

**Dependencies / verification:** B26 determines the export amount; B27 must avoid sweeping residue already posted. Historical repairs require reconciliation.

- [ ] **B16 — Refund journey is not wired end to end**

**Category:** Feature blocker.

**Summary and business impact:** The public route returns 501. Helpers and tables alone do not deliver a safe refund, settlement deduction, report update or merchant notification.

**Code references:** [apps/api/src/routes/refunds.ts](apps/api/src/routes/refunds.ts), [apps/api/src/refunds/initiateMerchantRefund.ts](apps/api/src/refunds/initiateMerchantRefund.ts), [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts), [apps/web/src/pages/transactions/RefundDrawer.tsx](apps/web/src/pages/transactions/RefundDrawer.tsx), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [apps/reporting/src/consumer/runConsumerPass.ts](apps/reporting/src/consumer/runConsumerPass.ts), [apps/api/src/webhooks/envelope.ts](apps/api/src/webhooks/envelope.ts), [apps/api/src/webhooks/dispatcher.ts](apps/api/src/webhooks/dispatcher.ts).

**Suggested fixes:** After fixing refund correctness, agree one endpoint and connect route/UI, state changes, net fee reversal, next-settlement deductions, reports and refund.succeeded delivery. Reverse fees cumulatively so partial refunds cannot over-reverse the original net fee.

**Why this approach:** Prevents exposing a refund button that moves money but leaves settlement or reconciliation inconsistent.

**Dependencies / verification:** B20, B21, B22 and B23 before activation; coordinate B28 and B39. Add envelope support before enabling a new dispatcher event type.

- [ ] **B17 — Client timestamps can bypass payment-link expiry**

**Category:** Payment authorization.

**Summary and business impact:** Expiry checking trusts submittedAt from the payer, allowing a backdated request to make an expired link payable.

**Code references:** [apps/api/src/paymentLinks/pay.ts](apps/api/src/paymentLinks/pay.ts), [apps/api/src/routes/paymentLinks.ts](apps/api/src/routes/paymentLinks.ts), [apps/web/src/pages/checkout/CheckoutPage.tsx](apps/web/src/pages/checkout/CheckoutPage.tsx).

**Suggested fixes:** Use server/database time in the atomic claim query. Keep client time as metadata only. Recover previously accepted attempts through durable idempotency rather than a client-controlled clock.

**Why this approach:** The payer cannot choose the clock used to authorize their own payment.

**Dependencies / verification:** B18. ARCHITECTURE.md currently describes client-time expiry; explicitly supersede that policy when implementing this reported defect.

- [ ] **B18 — Slow payment attempts allow two buyers to pay one link**

**Category:** Duplicate charge.

**Summary and business impact:** A timed-out reservation becomes claimable while its first processor request may still be running. Both attempts can capture before finalization.

**Code references:** [apps/api/src/paymentLinks/pay.ts](apps/api/src/paymentLinks/pay.ts), [apps/api/src/payments/authorize.ts](apps/api/src/payments/authorize.ts), [apps/api/src/payments/capture.ts](apps/api/src/payments/capture.ts), [db/migrations/0020_payment_links.sql](db/migrations/0020_payment_links.sql).

**Suggested fixes:** Persist a single active payment attempt with ownership and stable processor idempotency keys. Recover unknown outcomes before allowing another charge. Check ownership at finalization and enforce single-use before capture.

**Why this approach:** Protects customers before money moves; a longer timeout or a uniqueness error after capture cannot undo a double charge.

**Dependencies / verification:** B17 and B07. Include crash recovery so the fix does not leave links permanently reserved.

- [ ] **B19 — Callback redeliveries insert duplicate notes**

**Category:** Duplicate event processing.

**Summary and business impact:** Every callback is inserted and callback identity is not unique, so retries produce duplicate timeline evidence.

**Code references:** [apps/api/src/acquirer/callbacks.ts](apps/api/src/acquirer/callbacks.ts), [apps/api/src/routes/acquirerCallbacks.ts](apps/api/src/routes/acquirerCallbacks.ts), [db/migrations/0051_acquirer_callback_notes.sql](db/migrations/0051_acquirer_callback_notes.sql).

**Suggested fixes:** Enforce provider-scoped callback identity in the database and record effects in the same transaction. Acknowledge exact duplicates without reapplying; flag identity reuse with conflicting content.

**Why this approach:** Database uniqueness protects both sequential retries and simultaneous processes.

**Dependencies / verification:** B23. Review existing duplicate rows before adding uniqueness; do not conflate callback retries with the separate link-reservation bug.

- [ ] **B20 — Concurrent refunds can return money twice**

**Category:** Refund concurrency.

**Summary and business impact:** Validation and completion occur in separate transactions without reserving refundable funds. Two requests can both use the same available balance.

**Code references:** [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts), [apps/api/src/payments/idempotency.ts](apps/api/src/payments/idempotency.ts), [db/migrations/0042_refunds.sql](db/migrations/0042_refunds.sql).

**Suggested fixes:** Lock the scoped transaction, validate availability and persist a pending refund reservation atomically. Use a stable provider refund identity, then finalize once. Keep ambiguous outcomes pending until recovered.

**Why this approach:** Coordinates different idempotency keys and survives process crashes without over-refunding or losing a successful external refund.

**Dependencies / verification:** B21 and B16. A lock only during validation is insufficient if it is released without a durable reservation.

- [ ] **B21 — Refund limits use authorization instead of captured funds**

**Category:** Refund amount validation.

**Summary and business impact:** The helper subtracts refunds from the authorized amount, permitting refunds of money never captured on partially captured transactions.

**Code references:** [apps/api/src/payments/processRefund.ts](apps/api/src/payments/processRefund.ts), [apps/api/src/payments/refundValidation.ts](apps/api/src/payments/refundValidation.ts), [apps/api/src/payments/refundState.ts](apps/api/src/payments/refundState.ts).

**Suggested fixes:** Use captured fils minus successful refunds minus pending reservations under the transaction lock. Validate positive whole fils and authenticated merchant ownership before any processor call.

**Why this approach:** Constrains refunds to actual collected funds rather than an unused authorization ceiling.

**Dependencies / verification:** B20. Verify partial captures, repeated partial refunds, cross-merchant requests and cumulative fee reversal before B16.

- [ ] **B22 — Outbound webhook signatures cover different bytes than delivery**

**Category:** Integration correctness.

**Summary and business impact:** Signing uses canonical JSON while delivery uses ordinary JSON.stringify. Merchants verifying the received bytes can reject authentic notifications.

**Code references:** [apps/api/src/webhooks/sign.ts](apps/api/src/webhooks/sign.ts), [apps/api/src/webhooks/dispatcher.ts](apps/api/src/webhooks/dispatcher.ts), [apps/api/src/webhooks/testSend.ts](apps/api/src/webhooks/testSend.ts), [apps/api/src/webhooks/transport.ts](apps/api/src/webhooks/transport.ts).

**Suggested fixes:** Serialize once, sign the timestamp plus that exact body, and send those unchanged bytes. Apply the same contract to normal sends, tests and replays.

**Why this approach:** Makes the signature describe exactly what the receiver receives, independent of JSON property order.

**Dependencies / verification:** B16 and B24. Check compatibility for receivers previously canonicalizing bodies and document the raw-body contract.

- [ ] **B23 — Inbound callback verification permits unsigned or stale messages**

**Category:** Callback authentication.

**Summary and business impact:** Verification can accept absent signatures, has no freshness check, and uses Buffer.compare rather than a timing-safe equality check.

**Code references:** [apps/api/src/webhooks/inboundVerify.ts](apps/api/src/webhooks/inboundVerify.ts), [apps/api/src/routes/acquirerCallbacks.ts](apps/api/src/routes/acquirerCallbacks.ts), [apps/api/src/config.ts](apps/api/src/config.ts), [apps/api/src/lib/crypto.ts](apps/api/src/lib/crypto.ts).

**Suggested fixes:** Require live signatures, strictly parse headers, compare equal-length decoded MACs with timingSafeEqual, and enforce the provider-agreed timestamp policy. Authenticate the exact body representation required by the provider.

**Why this approach:** Rejects unauthenticated/tampered requests and limits replay without relying on misleading helper names.

**Dependencies / verification:** B19 and B07. Coordinate signing support with the provider/simulator before enforcing it; freshness policy must accommodate legitimate retries.

- [ ] **B24 — Concurrent payout scans enqueue duplicate notifications**

**Category:** Duplicate payout events.

**Summary and business impact:** A NOT EXISTS scan followed by insertion is not atomic across the daemon and CLI. Duplicate logical events can trigger duplicate messages and disbursement effects.

**Code references:** [apps/settlement/internal/settlement/payout_notify.go](apps/settlement/internal/settlement/payout_notify.go), [db/migrations/0009_outbox_events.sql](db/migrations/0009_outbox_events.sql), [apps/api/src/webhooks/payoutDisbursement.ts](apps/api/src/webhooks/payoutDisbursement.ts), [db/migrations/0057_settlement_payout_disbursements.sql](db/migrations/0057_settlement_payout_disbursements.sql).

**Suggested fixes:** Add event-specific database uniqueness for settlement.paid per batch and conflict-safe insertion. Independently deduplicate payout/disbursement effects by business identity.

**Why this approach:** Database constraints coordinate all processes; event-specific uniqueness preserves legitimate repeated partial-capture events.

**Dependencies / verification:** B08 and B22. Review existing duplicates and verify concurrent daemon/CLI passes create one logical payout.

- [ ] **B25 — Child payouts do not sum to the parent payout**

**Category:** Money allocation.

**Summary and business impact:** Each child's share is rounded independently, so total child payouts can be above or below the parent's amount.

**Code references:** [apps/settlement/internal/splits/shares.go](apps/settlement/internal/splits/shares.go), [apps/settlement/internal/splits/allocate.go](apps/settlement/internal/splits/allocate.go), [packages/money/src/fils.ts](packages/money/src/fils.ts).

**Suggested fixes:** Allocate integer base shares and distribute remaining fils by largest remainder with stable tie-breaking. Validate the weight contract and assert exact conservation before posting.

**Why this approach:** Every fil is allocated deterministically, with no created or lost money.

**Dependencies / verification:** B11 establishes the correct parent total. Use the existing allocation algorithm as reference; frozen money packages are not implicitly authorized for edits.

- [ ] **B26 — Exported scheme amounts differ from stored scheme fils**

**Category:** Money representation.

**Summary and business impact:** A decimal value derived from gross is rounded by NUMERIC(10,2), while amount_fils is truncated separately. The exporter prefers the decimal value.

**Code references:** [apps/settlement/internal/settlement/scheme_export.go](apps/settlement/internal/settlement/scheme_export.go), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [db/migrations/0050_scheme_export_lines_acquirer_amount.sql](db/migrations/0050_scheme_export_lines_acquirer_amount.sql).

**Suggested fixes:** Make the scheme amount authoritative in integer fils and derive all representations from it. Resolve the external decimal-text contract against the user's no-decimals rule before implementation; do not assume an exception.

**Why this approach:** One amount shared by export and accounting eliminates inconsistent rounding paths.

**Dependencies / verification:** B15 and B27. Preserve evidence of files already sent and reconcile historical differences before any re-export.

- [ ] **B27 — March reconciliation posts duplicate corrections on rerun**

**Category:** Reconciliation idempotency.

**Summary and business impact:** Fresh UUIDs are generated on every execution and no business-level duplicate guard exists, so reruns can change balances again.

**Code references:** [scripts/reconcile_march.ts](scripts/reconcile_march.ts), [db/migrations/0007_ledger_double_entry.sql](db/migrations/0007_ledger_double_entry.sql).

**Suggested fixes:** Use a stable reconciliation/source identity enforced uniquely in the database, claimed in the same transaction as the correction. Use reconciled source lines, exclude already-accounted residue and provide a dry run.

**Why this approach:** An operation identity remains the same across retries and processes, unlike a newly generated entry UUID.

**Dependencies / verification:** B15, B26 and B10. Resolve the documented monthly-window conflict and review existing postings; repair duplicates with explicit compensating entries.

- [ ] **B28 — MDR recalculation rewrites frozen paid batch totals**

**Category:** Historical accounting.

**Summary and business impact:** Recalculation selects non-open batches and updates their fee/net totals even after payout, changing the recorded history of what was paid.

**Code references:** [apps/settlement/internal/settlement/recalculate_mdr.go](apps/settlement/internal/settlement/recalculate_mdr.go), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go), [apps/api/src/admin/settlementClient.ts](apps/api/src/admin/settlementClient.ts).

**Suggested fixes:** Preserve closed/paid batch amounts. Store approved corrections separately, linked to the source batch with a stable identity, and settle their financial effect once in an appropriate later payout. Apply the agreed accounting effective date.

**Why this approach:** Preserves payout evidence while allowing traceable corrections that actually affect money owed.

**Dependencies / verification:** B08, B13, B14 and B16. Coordinate settlement/report consumption; merely stopping the UPDATE would leave corrections unpaid.

- [ ] **B29 — Displayed current fee uses entry date instead of effective date**

**Category:** Pricing visibility.

**Summary and business impact:** The display selects the latest created fee schedule, so backdated or future rows can show a rate that charging does not use.

**Code references:** [apps/api/src/fees/currentFeeScheduleDisplay.ts](apps/api/src/fees/currentFeeScheduleDisplay.ts), [apps/api/src/fees/feeSchedule.ts](apps/api/src/fees/feeSchedule.ts), [apps/settlement/internal/settlement/fee_schedule.go](apps/settlement/internal/settlement/fee_schedule.go).

**Suggested fixes:** Use the same effective-date resolution and fallback as charging, with deterministic tie-breaking. Label base rates and discounts separately.

**Why this approach:** Explains the actual applicable pricing instead of when a staff member entered a schedule.

**Dependencies / verification:** B28. Do not change historical charged rates just to match a previously incorrect display.

- [ ] **B30 — Lifetime payout totals lose whole-fils precision**

**Category:** Monitoring correctness.

**Summary and business impact:** Payout accumulation converts amounts to float32 and stores the total as REAL, losing precision for high-volume merchants.

**Code references:** [apps/settlement/internal/settlement/payout_estimate.go](apps/settlement/internal/settlement/payout_estimate.go), [db/migrations/0040_merchants_lifetime_payout_monitoring_estimate.sql](db/migrations/0040_merchants_lifetime_payout_monitoring_estimate.sql).

**Suggested fixes:** Migrate to a clearly named integer-fils total, use integer accumulation and rebuild from authoritative payout records. Check dependent serializers and reports.

**Why this approach:** Reconstructing from exact source records recovers information that casting an already-rounded float cannot restore.

**Dependencies / verification:** B11, B08 and B28. Treat schema changes as explicit migrations and reconcile before/after totals.

- [ ] **B31 — Status maintenance accidentally activates test merchants**

**Category:** Test/live isolation.

**Summary and business impact:** Status recomputation excludes authorized rows, reports zero open authorizations, and can then clear test_mode. Test captures can become eligible for real settlement.

**Code references:** [apps/api/src/admin/transactionStatusRecompute.ts](apps/api/src/admin/transactionStatusRecompute.ts), [apps/api/src/admin/merchantFlags.ts](apps/api/src/admin/merchantFlags.ts), [apps/api/src/routes/adminMerchantsRecompute.ts](apps/api/src/routes/adminMerchantsRecompute.ts), [apps/settlement/internal/settlement/batch.go](apps/settlement/internal/settlement/batch.go).

**Suggested fixes:** Remove activation from status maintenance. Use a separate authorized and audited go-live operation; preserve each transaction's test/live provenance. Count open authorizations from the correct population when needed.

**Why this approach:** Separates maintenance from a business activation decision and prevents historical test money entering live payouts.

**Dependencies / verification:** B08 and B10. Audit previously changed merchants before backfills or live payout activation.

- [ ] **B32 — Pending merchant sessions bypass OTP verification**

**Category:** Authentication.

**Summary and business impact:** The protected session lookup reads live_sessions without requiring authenticated=true, so a password-only pending session can grant access.

**Code references:** [apps/api/src/auth/sessions.ts](apps/api/src/auth/sessions.ts), [db/migrations/0058_live_sessions.sql](db/migrations/0058_live_sessions.sql), [apps/api/src/auth/requireMerchantAuth.ts](apps/api/src/auth/requireMerchantAuth.ts), [apps/web/src/auth/DashboardAuthContext.tsx](apps/web/src/auth/DashboardAuthContext.tsx).

**Suggested fixes:** Require authenticated=true for every protected merchant-session lookup. Keep pending lookups limited to OTP endpoints and verify promotion/expiry/revocation handling.

**Why this approach:** Enforces the intended two-step authentication boundary on the server.

**Dependencies / verification:** B06 and B09. Dashboard calls made before OTP must now remain in the OTP flow rather than expect protected data.

- [ ] **B33 — Merchant and admin OTP codes use Math.random**

**Category:** Authentication randomness.

**Summary and business impact:** OTP generation uses a non-cryptographic random source for login credentials. Database uniqueness does not provide unpredictability.

**Code references:** [apps/api/src/auth/otp.ts](apps/api/src/auth/otp.ts), [apps/api/src/adminAuth/otp.ts](apps/api/src/adminAuth/otp.ts), [apps/api/src/lib/random.ts](apps/api/src/lib/random.ts).

**Suggested fixes:** Use crypto.randomInt for OTP digits while preserving code length and leading zeroes. Retain expiry, atomic attempt limits, single-use verification and resend controls.

**Why this approach:** Uses a random source intended for security-sensitive credentials without changing the user's login process.

**Dependencies / verification:** B32 and B09. Prefer an OTP-specific change or audit other consumers before changing a shared random helper; earlier repository guidance conflicts with this remediation.

- [ ] **B34 — Merchants can cancel another merchant's payment link**

**Category:** Merchant isolation.

**Summary and business impact:** The cancellation helper updates and reads by link ID only. URL merchant validation does not prove the supplied link belongs to that merchant.

**Code references:** [apps/api/src/paymentLinks/cancel.ts](apps/api/src/paymentLinks/cancel.ts), [apps/api/src/routes/paymentLinks.ts](apps/api/src/routes/paymentLinks.ts).

**Suggested fixes:** Pass merchant ID from authenticated context and require both link ID and merchant ID in update and lookup queries. Return not-found for out-of-scope links.

**Why this approach:** Enforces ownership at the database operation that changes the resource.

**Dependencies / verification:** B32. Verify merchant A cannot cancel merchant B's link even through A's valid URL.

- [ ] **B35 — Impersonation grants exceed documented write permissions**

**Category:** Authorization policy conflict.

**Summary and business impact:** Finance admins become merchant finance users and can write during impersonation, while ADMIN.md reserves impersonated writes for super admins. HANDOVER.md describes all impersonation as read-only.

**Code references:** [apps/api/src/admin/impersonation.ts](apps/api/src/admin/impersonation.ts), [apps/api/src/auth/requireMerchantAuth.ts](apps/api/src/auth/requireMerchantAuth.ts), [apps/api/src/routes/adminMerchants.ts](apps/api/src/routes/adminMerchants.ts), [docs/ADMIN.md](docs/ADMIN.md), [docs/HANDOVER.md](docs/HANDOVER.md).

**Suggested fixes:** Resolve the direct-doc conflict. Enforce explicit read-only grants for support/finance under ADMIN.md's policy, permit only approved super-admin write scopes, and validate the originating admin remains active.

**Why this approach:** Makes permissions depend on an explicit server-enforced grant rather than broad merchant roles or hidden UI buttons.

**Dependencies / verification:** B32 and B34. Test writes through merchant endpoints for every admin role, including expired and disabled-admin grants.

- [ ] **B36 — Transaction CSV exports load the full result into memory**

**Category:** Resource use.

**Summary and business impact:** The active export route loads all rows, maps them into strings and joins one large CSV. Large requests can exhaust API memory and interrupt other merchants' payments.

**Code references:** [apps/api/src/transactions/exportCsv.ts](apps/api/src/transactions/exportCsv.ts), [apps/api/src/routes/transactions.ts](apps/api/src/routes/transactions.ts).

**Suggested fixes:** Use bounded reads and streaming with backpressure, or a durable background export job. Apply server-side resource limits and cancellation handling; keep amount units explicit.

**Why this approach:** Bounds memory by batch size rather than merchant history while retaining complete exports.

**Dependencies / verification:** B38 must be fixed before adopting the existing streaming helper. Measure actual memory; an OOM incident has not been reproduced in this review.

- [ ] **B37 — Webhook archive creation and replay load entire histories**

**Category:** Resource use.

**Summary and business impact:** Archive creation fetches all deliveries and serializes one large document; replay reads it all back. Large histories can exhaust memory despite documentation describing pages.

**Code references:** [apps/api/src/webhooks/archiveReplay.ts](apps/api/src/webhooks/archiveReplay.ts), [db/migrations/0068_webhook_delivery_archives.sql](db/migrations/0068_webhook_delivery_archives.sql), [apps/api/src/routes/adminMerchants.ts](apps/api/src/routes/adminMerchants.ts).

**Suggested fixes:** Store archives in bounded chunks or streamed storage, with resumable job progress and bounded replay batches. Preserve delivery provenance and define replay identity explicitly.

**Why this approach:** Keeps complete audit history without holding the entire history in one API process.

**Dependencies / verification:** B22 and B24. Existing archive format needs a compatibility/migration plan; this is split from the large-export source entry.

- [ ] **B38 — Existing streaming export cursor can skip transactions**

**Category:** Latent export correctness.

**Summary and business impact:** The streaming helper paginates only by occurred_at and advances with a strict greater-than timestamp. Rows sharing the boundary timestamp can be omitted.

**Code references:** [apps/api/src/transactions/exportCsv.ts](apps/api/src/transactions/exportCsv.ts).

**Suggested fixes:** Order and paginate by the composite (occurred_at, id), preserve database timestamp precision in the cursor, and define snapshot consistency for concurrent writes.

**Why this approach:** A stable unique ordering prevents silent omissions at page boundaries.

**Dependencies / verification:** B36. Test more than one page of rows sharing a timestamp before wiring this helper into the live route.

- [ ] **B39 — Settlement summary overcounts partial captures and is slow**

**Category:** Reporting correctness / performance.

**Summary and business impact:** The summary joins capture events to transactions, then sums each transaction's running captured total once per event. Partial captures inflate business totals and the join adds unnecessary work.

**Code references:** [apps/api/src/settlement/query.ts](apps/api/src/settlement/query.ts), [apps/api/src/routes/settlement.ts](apps/api/src/routes/settlement.ts), [docs/perf/2026-07-settlement-summary-slow.md](docs/perf/2026-07-settlement-summary-slow.md).

**Suggested fixes:** Sum per-event amount_fils within the Bahrain window and count distinct transactions separately. After correcting totals, inspect the query plan and add measured indexes. Reconcile with matching batch windows.

**Why this approach:** Measures the money moved in the requested period instead of repeatedly counting cumulative totals; correctness comes before tuning.

**Dependencies / verification:** B10, B11 and B16. Verify captures spanning multiple days and profile representative high-volume data.
