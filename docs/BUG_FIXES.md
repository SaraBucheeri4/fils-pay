# FilsPay bug fixes and remaining work

Updated: 2026-10-30. Scope: the current repository implementation, including
the original finance/support cases and subsequent reviews. This document
explains what went wrong, what it affected, and how the implementation changed.
It does not claim that these changes have been deployed or that historical
financial records have been repaired.

## How to read this document

The categorized tables below describe **implemented fixes**. Implementation
does not mean every integration, concurrency, browser or performance check has
passed. The final sections explicitly separate unfinished work and items that
were reclassified rather than fixed. Original IDs are retained for traceability;
related IDs sometimes describe different consequences of the same root cause.

Intended business behavior comes only from [ARCHITECTURE](ARCHITECTURE.md),
[HANDOVER](HANDOVER.md), and [the ADRs](adr/README.md), including supersession.
This is an implementation summary, not a new source of business rules.
The [original checklist](../project_bug_checklist.md) retains historical
evidence, including descriptions of code that has since been replaced.

## 1. Build, configuration and operational safety

| ID | What the bug was | What it broke | How it was fixed |
|---|---|---|---|
| B01 | Compose referred to application Dockerfiles that were absent. | A checkout could not build the local application images. | Added the Node and Go Dockerfiles and their workspace build inputs. |
| B02 | A migration view referred to a table that did not exist at that point in the migration sequence. | Applying the schema to a fresh database failed; the unbatched view also omitted partial captures. | Added compatibility view migration `0053a`, then upgrade migration `0074` to select both capture kinds using `transaction_events.settlement_batch_id IS NULL`. |
| B04 | The development webhook-encryption fallback decoded to 34 bytes rather than the required 32. | Configuration validation prevented the API from starting with the fallback. | Replaced it with a valid 32-byte development-only key; non-development environments still require a supplied key. |
| B05 | Compose did not provide the settlement internal-service token. | The settlement daemon could not start or authenticated API-to-worker calls failed. | Supplied matching local tokens to the API and settlement services; hosting preparation requires an explicit secret. |
| B06 | Browser clients and the API had incompatible origin/proxy setup. | Login and dashboard requests failed when served through the frontend. | Defaulted clients to same-origin `/v1` requests and configured both Vite proxies to forward to the API. |
| B40 | The Node runtime user could not write application-owned directories. | Uploads and frontend development caches failed with filesystem permissions errors. | Assigned appropriate ownership in the Node image and created the KYC directory for the runtime user. |
| B41 | The documented/runtime Node version did not meet dependency requirements. | Dependency installation and container builds failed. | Aligned the Node images and setup guidance with Node 22. |
| B52 | The seed used merchant truncation with cascading deletion without an adequate safety boundary. | Running it against valuable data could erase all linked merchant records. | Added disposable/local-database safeguards and made seeding an explicit Compose profile rather than a routine startup action. The seed remains destructive when deliberately run. |
| B55 | The documented nightly balance refresh had no scheduled implementation. | Cache drift could persist instead of being corrected automatically. | Added the daemon's 02:00 Bahrain ledger-based rebuild, including display-adjustment reset under the accepted policy. |
| B56 | Agent guidance contradicted integer-fils rules and Bahrain settlement windows. | Agents could introduce incorrect money/date behavior while following repository instructions. | Corrected the operating guidance and designated-source authority rules. This was a documentation/process correction. |
| B57 | Comments claimed migration checksum protection that the runner did not implement. | Operators were given a false guarantee that modified applied migration files would be detected. | Removed the false assurance and documented filename-based tracking and immutable applied migrations. **Checksum enforcement was not added.** |
| B61 | Hold-expiry logic could delete hold records, including an unsafe empty-selection path. | Authorization history could disappear instead of being retained for audit. | Expiry updates eligible active holds to `expired` and retains the rows. |
| B73 | A failed `ROLLBACK` replaced the original transaction error. | Diagnosis lost the real cause, and a broken connection could be returned without its failure state. | Preserve the original exception, report rollback failure separately, and release the client with the rollback error so the pool can discard it. |

Implementation areas: [ops](../ops/README.md), [migration runner](../db/migrate.ts),
[hold expiry](../scripts/expire_holds.ts), and [scheduler](../apps/settlement/internal/scheduler/daemon.go).

## 2. Login, credentials and authentication

| ID | What the bug was | What it broke | How it was fixed |
|---|---|---|---|
| B32 | Password-only pending merchant sessions could be resolved as authenticated sessions. | A user could access protected functionality without completing OTP verification. | Required completed authentication in protected session lookup; retained separate pending-session lookup for OTP endpoints and excluded pending sessions from the live-session view. |
| B33 | Merchant/admin OTP generation used non-cryptographic randomness. | Login codes were generated with an unsuitable security primitive. | Switched digit generation to cryptographic `randomInt`, preserving code length and leading zeroes. |
| B42 | Login could resolve the OTP/session recipient through an email lookup insufficiently scoped to the merchant. | Shared emails across merchants could create a session for the wrong merchant user. | Bound the challenge and pending session to the exact merchant-user row whose password was verified. |
| B50 | Payment-link bearer tokens used `Math.random`. | Public checkout tokens lacked the required cryptographic unpredictability. | Generated tokens from cryptographic random bytes. |
| B51 | Admin invitation code expected a missing schema object. | Creating or accepting an admin invitation failed against the migrated schema. | Added the supporting invitation schema and aligned the invitation flow with it. |
| B62 | The pending-session bypass also reached API-key creation. | Password-only access could be converted into a long-lived credential. | Applied the completed-OTP authentication requirement to credential issuance; this shares B32's root fix. |
| B100 | Admin key rotation issued a replacement but left the original unrevoked. | Both credentials remained usable, defeating key retirement. | Under the original key's row lock, revoke it with reason `rotated`, issue the replacement, and write the audit record in one transaction. Failed replacement/audit rolls everything back. There is no automatic grace period. |

See [session lookup](../apps/api/src/auth/sessions.ts),
[random generation](../apps/api/src/lib/random.ts),
[key rotation](../apps/api/src/admin/apiKeys.ts), and [ADR-0018](adr/0018-api-key-rotation-revokes-original.md).
OTP email delivery itself is tracked separately as B09 below.

## 3. Permissions, merchant isolation and audit history

| ID | What the bug was | What it broke | How it was fixed |
|---|---|---|---|
| B34 | Payment-link cancellation selected rows by link ID without enforcing merchant ownership. | One merchant could cancel another merchant's link. | Passed the authenticated merchant ID into both update and follow-up lookup; out-of-scope links return not-found. |
| B35 | Impersonation could confer merchant write privileges, and ordinary credentials could take precedence over a live grant. | Admins viewing a merchant could mutate its data despite the read-only promise. | Gave the live grant precedence, restricted it to merchant support/read-only access, rejected write methods across authentication paths, and retained the originating admin identity. |
| B64 | Impersonation did not explicitly enforce the intended admin-role policy. | Route authorization and documented access could diverge. | Applied an explicit all-active-admin role gate, with every resulting grant read-only, as approved in ADR-0008. This is not a finance-only restriction. |
| B67 | Credit self-approval compared mutable display names. | A renamed user could bypass the distinct-approver rule, while unrelated users sharing a name could be blocked. | Compared stable admin user IDs when enforcing the second-approver rule. |
| B68 | Refund transaction lookup lacked the required merchant scope. | A merchant could attempt to refund another merchant's transaction. | Selected and locked the transaction using both transaction ID and authenticated merchant ID. |
| B72 | Child-merchant report scope checked child membership without the authenticated parent relationship. | A marketplace could request another marketplace's child data. | Required the requested child to belong to the authenticated parent. |
| B79 | The reporting export-summary route used merchant context without its authentication prehandler. | Requests failed because context was absent; a cookie alone did not populate it. | Added the required authentication prehandler before accessing merchant context. No prior data disclosure is asserted. |
| B85 | Bulk KYC approval bypassed expected state checks and individual review records. | Invalid selections could transition incorrectly and leave incomplete review/audit history. | Made the selection atomic and restricted it to existing `under_review` merchants, writing individual KYC reviews and audit evidence in the transaction. |
| B87 | Webhook deletion hard-deleted a row still referenced by deliveries and archives. | Deletion could fail on foreign keys or conflict with history-retention promises. | Disable the endpoint instead of deleting its evidence; retain delivery/archive records. |
| B90 | Refund authorization treated NULL opt-in inconsistently. | Merchants without explicit consent could be allowed to refund. | Require `refunds_enabled = true`; false and NULL are denied. Added audited, single-merchant finance/super-admin opt-in controls without bulk-enabling existing merchants. |

Policy references: [ADR-0008](adr/0008-admin-security-and-webhook-retention.md),
[ADR-0009](adr/0009-refund-enablement.md), and [ADR-0015](adr/0015-refund-opt-in-administration.md).
Implementation includes [merchant authentication](../apps/api/src/auth/requireMerchantAuth.ts)
and [report scope](../apps/api/src/reporting/scope.ts).

## 4. Money, fees, settlement and reconciliation

| ID | What the bug was | What it broke | How it was fixed |
|---|---|---|---|
| B10 | The daemon selected the completed business day from the UTC calendar. | Bahrain settlement could run on the wrong date or first close around 03:00 local. | Selected dates and due times using Bahrain's calendar. The configured default grace period remains 15 minutes after midnight; processing is not promised at exactly 00:00. |
| B11 | Net payout converted integer fils through `float32` dinars. | Large amounts could gain or lose fils. | Compute gross minus fees directly in integer fils. |
| B12 | Manual-adjustment CSV parsing assumed two decimal places. | `4.75` BD became 475 rather than 4750 fils, and three-decimal precision was lost. | Parse BHD text with the exact three-decimal money helper and reject unsupported input. |
| B14 | Admin and CLI balance rebuilds read different financial sources. | The same merchant received different cached balances depending on the entry point. | Make both rebuild paths use the authoritative ledger calculation, including the required handling of display-only adjustments. |
| B15 | Export creation did not journal the scheme's truncated remainder. | Ledger clearing/residue accounting did not explain the missing 0–9 fils per line. | Post the clearing credit and residue debit atomically with the export line, with a unique per-line posting identity. |
| B25 | Child split amounts were rounded independently without allocating the remainder. | Child payouts failed to sum to the parent net payout. | Allocate integer shares and distribute remaining fils by largest remainder with deterministic tie-breaking. |
| B26 | Scheme decimal output and stored integer scheme amounts could be calculated differently. | Export files disagreed with stored amounts and residue calculations. | Derive the external two-decimal representation from the authoritative truncated `amount_fils`. |
| B27 | The March sweep could repost corrections and used inconsistent calendar boundaries. | Re-running the script could double the discrepancy rather than repair it. | Use Bahrain month bounds, per-line receipt/idempotency tracking and the shared residue posting function. Default to inspection; refuse blind application where legacy sweeps require review. |
| B28 | MDR recalculation rewrote closed/paid batch totals. | Historical settlement amounts and already-issued payouts changed after the fact. | Freeze those totals and post balanced, separately tracked correction journals for later settlement, including negative carry handling. |
| B29 | The displayed fee schedule was selected by entry date rather than effective date. | A backfilled or future rate could be shown as the currently applicable rate. | Choose the newest already-effective schedule, using deterministic tie-breaking. |
| B30 | The lifetime payout monitoring counter used floating-point storage/updates. | High-volume monitoring totals lost whole-fils precision. | Store and accumulate integer fils in BIGINT. Previously lost precision is not reconstructed. |
| B31 | Status maintenance could clear `test_mode`. | Sandbox merchants could become eligible for real settlement selection. | Maintenance no longer promotes merchants out of sandbox; settlement also explicitly excludes test merchants. |
| B46 | Cumulative platform volume was stored as a 32-bit integer. | Accumulated fils could overflow the counter. | Widened financial counters to BIGINT. Counter capacity is separate from whether a pricing tier is approved. |
| B47 | Promotional amount parsing used floating-point/two-decimal assumptions. | Three-decimal BHD amounts were converted incorrectly. | Use exact BHD-to-fils parsing for promotional amount text. |
| B48 | A refund-related settlement notification helper divided fils by ten. | Its payload would report the wrong monetary unit. | Preserve whole-fils amounts without scaling. The reviewed helper has no active caller; this does not establish a historical delivery incident. |
| B49 | Reconciliation fee estimates used floating-point rate arithmetic. | Estimated pending amounts could differ by fils from financial calculations. | Use integer rate arithmetic and the agreed discount-before-MDR rounding order. |
| B66 | Capture and settlement applied discount/MDR in different orders. | The same capture could have different fees in the ledger and settlement, including the recorded 15-versus-14-fils case. | Apply the negotiated discount to the chargeable base before MDR, using shared integer rounding semantics and persisted capture fees. |
| B70 | Checkout bypassed the transaction-route-only discount adjustment. | Payment-link checkout and direct captures charged different fees. | Centralize fee calculation in capture so both entry points journal the same negotiated pricing. |
| B88 | Reconciliation pending activity omitted refunds and their fee reversals. | A refund changed ledger payable without a matching pending amount, producing misleading gaps. | Include succeeded refund gross and actual reversed fees once, track settlement claims, and attribute activity to the same Bahrain window. |
| B89 | Pending reconciliation recomputed fees from current fallback terms rather than capture-time facts. | Effective schedules and historical discounts could disagree with reported pending net. | Prefer recorded capture snapshots/journals and controlled event-time fallback pricing; retain historical tier-priced fees instead of repricing them. |
| B93 | New captures applied the platform volume-tier discount without a resolved approved rule. | Actual capture pricing could differ from merchant terms and displayed MDR. | Following owner approval in ADR-0019, exclude the platform tier from new captures and record a zero bonus. Preserve historical fees, snapshots and idempotent responses. |

Core implementation: [batch close](../apps/settlement/internal/settlement/batch.go),
[split allocation](../apps/settlement/internal/splits/shares.go),
[capture](../apps/api/src/payments/capture.ts),
[reconciliation](../apps/api/src/settlement/query.ts), and
[March inspection/repair script](../scripts/reconcile_march.ts).
Decisions: [ADR-0007](adr/0007-approved-settlement-corrections.md),
[ADR-0010](adr/0010-refund-settlement-carry.md),
[ADR-0011](adr/0011-display-adjustments-survive-settlement.md),
[ADR-0016](adr/0016-review-safety-and-accounting.md), and
[ADR-0019](adr/0019-approved-local-case-corrections.md).

## 5. Payment lifecycle, refunds and idempotency

| ID | What the bug was | What it broke | How it was fixed |
|---|---|---|---|
| B17 | Client-supplied `submittedAt` controlled link expiry eligibility. | A backdated request could pay a link already expired on the server. | After the owner superseded the old offline/client-clock policy, require `expires_at > now()` at the atomic database claim. Client timestamps cannot extend validity. |
| B18 | A slow/unknown capture could outlive its link reservation and admit another buyer. | Two attempts could charge the same single-use link. | Persist reservation/capture identity, validate ownership before capture, reuse stable acquirer request identity, and block uncertain outcomes until explicitly resolved. Definite refusals follow the safe void/release path. |
| B20 | Refund eligibility checks were not serialized with the refund operation. | Concurrent requests could both spend the same refundable balance. | Lock the merchant-scoped transaction through validation, acquirer call and commit, with idempotent request handling. |
| B21 | Refund limits used authorized rather than actually captured funds. | Partial captures could be refunded beyond the amount charged. | Limit each refund to captured minus already-refunded funds. |
| B58 | An omitted refund reason violated the database constraint. | Otherwise valid refund requests failed during insertion. | Normalize omitted reasons to the supported default before persistence. |
| B65 | Refund/status handling could treat a fully refunded partial capture as refundable again. | Status-based eligibility could reopen exhausted captured funds. | Base eligibility on the remaining captured balance and derive refund state from captured/refunded totals; this is consolidated with B21. |
| B69 | Capture request hashing omitted the transaction identity. | Reusing a key and amount for a different transaction could replay the first transaction's response. | Include transaction ID and amount in canonical request identity; cross-resource reuse is rejected. |
| B83 | Refund fee reversal counted fee credits without discount debits and lacked cumulative conservation. | Partial refunds could reverse more or less than the net fee actually charged. | Read the remaining net historical fee, including prior reversals, and allocate it against remaining refundable funds so the final refund exhausts the remaining fee exactly. |
| B91 | Transaction responses omitted cumulative refunded fils. | The UI could show the wrong remaining refund amount or lose refund visibility. | Include `refundedFils` in the shared transaction serializer and downstream display/report handling. |

Implementation: [payment-link pay](../apps/api/src/paymentLinks/pay.ts),
[refund processing](../apps/api/src/payments/processRefund.ts),
[idempotency](../apps/api/src/payments/idempotency.ts), and
[transaction serialization](../apps/api/src/transactions/serialize.ts).
The complete refund journey remains separately tracked as B16; fixing these
helpers does not remove the default release gate or merchant opt-in.

## 6. Webhooks, callbacks and payout notifications

| ID | What the bug was | What it broke | How it was fixed |
|---|---|---|---|
| B19 | Redelivered callbacks inserted duplicate timeline notes. | A single bank callback appeared as multiple pieces of evidence. | Enforce callback-ID uniqueness and acknowledge duplicate inserts without adding another note. This note handler does not itself capture funds. |
| B22 | Signing and transport serialized the webhook differently. | Merchants could reject valid deliveries because the signature covered different bytes. | Serialize once, sign that exact body, and send the same bytes. |
| B23 | Callback verification allowed unsafe signature behavior and authenticated a re-serialized body. | Missing/stale callbacks could be accepted under legacy settings, while valid differently formatted JSON could be rejected. | Require current signatures regardless of the legacy flag; under ADR-0019, capture raw JSON bytes in a scoped parser and verify timestamp-plus-body HMAC without reserialization. Preserve retired-secret rejection and JSON/body limits. |
| B24 | Concurrent payout scans could both enqueue the same payout notification. | Shops received duplicate business payout events. | Lock candidate batches and enforce business-event uniqueness. Transport retries remain at-least-once and still require receiver deduplication. |
| B71 | Disbursement records were created as a webhook-delivery side effect. | Zero subscribers meant missing records; multiple endpoints or replay could duplicate bookkeeping. | Create one durable record per paid batch independently of subscribers and enforce its uniqueness. This is not proof that the old bug caused duplicate bank transfers. |
| B80 | Webhook responses were fully buffered before storing a shortened excerpt. | A merchant-controlled endpoint could consume excessive API memory. | Bound bytes while reading responses and preserve timeout/cancellation behavior. |
| B84 | Separate dispatcher replicas could select and send the same due delivery without a durable claim. | Concurrent attempts duplicated delivery work and could repeat attached bookkeeping. | Claim attempts across replicas and keep payout bookkeeping independently idempotent. |
| B97 | Hex decoding silently discarded trailing junk or incomplete input. | Malformed digests could compare equal to valid SHA-256 signatures. | Require exactly 64 hexadecimal characters before decoding, then compare bytes in constant time. Shared OTP and signature callers retain their checks. |

Implementation: [dispatcher](../apps/api/src/webhooks/dispatcher.ts),
[callback route](../apps/api/src/routes/acquirerCallbacks.ts),
[inbound verification](../apps/api/src/webhooks/inboundVerify.ts),
[digest comparison](../apps/api/src/lib/crypto.ts), and
[payout notification scan](../apps/settlement/internal/settlement/payout_notify.go).

## 7. Reporting, exports and resource use

| ID | What the bug was | What it broke | How it was fixed |
|---|---|---|---|
| B36 | The active transaction export loaded and joined the complete result in memory. | Large merchant histories risked exhausting the API process; an early streaming integration also returned an empty body. | Stream bounded pages with backpressure and return the response stream from the route. |
| B37 | Webhook archive/replay loaded unbounded delivery histories. | Large archives risked exhausting API memory. | Reject requests exceeding explicit delivery-count and serialized-size bounds. The implemented limit is 1000 deliveries / 4 MiB, not an unlimited paged archive service. |
| B38 | Export pagination advanced by timestamp alone and could lose precision. | Transactions sharing a page-boundary timestamp could be skipped. | Use a composite timestamp/ID cursor, preserve database microseconds, and read within a repeatable-read snapshot. |
| B39 | Settlement summary summed cumulative transaction captures once per capture event. | Partial captures inflated totals and complicated the query. | Sum event amounts and count distinct transactions within the Bahrain window. Representative SQL performance remains unmeasured under B101. |
| B43 | Refund rollup code wrote columns absent from migrations. | Reporting failed when processing refund events. | Added the required schema through upgrade migrations and aligned the consumer's fields. |
| B44 | Refund daily aggregation used UTC dates. | Refund activity near midnight appeared in the wrong Bahrain business day. | Bucket activity using Bahrain calendar dates. |
| B45 | A refund summary view joined using the wrong key/column. | Refund totals could fail or be attributed incorrectly. | Corrected the summary join in the upgrade schema. |
| B74 | Reporting processes read the same consumer cursor without serialization. | Concurrent workers could apply activity twice. | Lock the durable consumer identity/cursor while processing. |
| B75 | A sequence-ID watermark was treated as commit order. | A lower-ID transaction committing late could be skipped permanently. | Track durable per-event consumption receipts rather than relying solely on `id > watermark`. Historical skipped events require a separate rebuild. |
| B76 | Analytics rebuild did not coordinate its snapshot with workers and receipts. | Events already represented in rebuilt totals could be added again by the consumer. | Coordinate rebuild locking, source snapshot and consumption tracking before resuming workers. |
| B77 | Batch-close reporting assumed a daily rollup row already existed. | Missing rows caused repeated consumer failure and blocked subsequent processing. | Handle/recover the missing rollup instead of dereferencing an absent row. |
| B78 | Reporting processed close events but omitted the later payout lifecycle update. | Trend status and `paid_at` could remain stale. | Consume the paid lifecycle event idempotently and update the payout view. |
| B86 | Saved-filter listing relied on a nonexistent database count cap. | Filter growth/listing was effectively unbounded despite reassuring comments. | Enforce an actual application quota and remove the false constraint claim. |
| B95 | CSV quoting did not neutralize formula-capable text. | Spreadsheet applications could execute formulas embedded in references. | Prefix dangerous text before CSV escaping, including whitespace/control-character cases, while leaving signed monetary columns numeric. |
| B96 | Transaction path IDs reached UUID SQL queries without validation. | Malformed IDs produced internal SQL errors/500 responses. | Validate UUID shape/length on detail, events, capture and void routes; invalid IDs return 404 before querying. |
| B98 | A batch progress bar derived an undefined percentage through floating-point money arithmetic. | It displayed a meaningless measure and violated the integer-money rule. | Remove the bar and its calculation; retain whole-fils amount formatting. |

Implementation: [CSV export](../apps/api/src/transactions/exportCsv.ts),
[transaction routes](../apps/api/src/routes/transactions.ts),
[settlement reports](../apps/api/src/settlement/query.ts), and
[reporting consumer](../apps/reporting/src/consumer/runConsumerPass.ts).

## 8. File-upload and outbound-request safety

| ID | What the bug was | What it broke | How it was fixed |
|---|---|---|---|
| B63 | Webhook URL validation did not reliably exclude internal/private destinations. | Server-side webhook requests could target internal services instead of merchant endpoints. | Validate resolved destinations, block private/internal address ranges and unsafe redirects, and apply outbound transport safeguards. |
| B81 | A document-specific PDF requirement trusted the filename after generic file detection. | A renamed image could pass a PDF-only KYC check. | Enforce the document-specific requirement using the detected MIME/content type. |
| B82 | Thumbnail generation had no explicit application decoded-pixel budget. | A small compressed image could require excessive decoded resources. | Add a four-megapixel decoded-image limit and bound concurrent decoding. This is a resource safeguard, not proof of a previously exploited outage. |

Implementation: [webhook transport](../apps/api/src/webhooks/transport.ts),
[KYC upload](../apps/api/src/onboarding/kyc.ts), and
[thumbnail generation](../apps/api/src/onboarding/kycThumbnail.ts).

## 9. Implemented components with outstanding acceptance work

These entries are included for completeness but must not be presented as fully
closed bugs. They retain their open status in the task list.

| ID | Original problem and impact | Implemented work | What remains |
|---|---|---|---|
| B09 | OTP delivery only logged codes, preventing usable email-based login. | Merchant login/resend and admin login await Resend; failures are controlled; codes are not disclosed in production responses/logs. Temporary inbox routing is server-side configuration. | Full login, expiry, resend and delivery-error integration verification. Two notifier smoke emails were accepted; that is not full login evidence. |
| B16 | Refunds lacked a complete user/API/accounting/reporting/notification journey. | Route/drawer, opt-in controls, historical fee reversals, settlement carry, timeline, reporting and `refund.succeeded` delivery exist. Retry identity survives ambiguous responses; successful refunds are not reported as failed merely because refresh failed. | Complete browser and current-stack acceptance evidence. Default-off `FEATURE_REFUNDS` is intentional under ADR-0015, not a remaining missing-code defect. Earlier recorded API/worker checks do not imply every current journey was rerun. |
| B53 | A callback signing credential was committed. | Removed the tracked value and permanently reject its fingerprint. | External credential-use/revocation evidence and an explicitly coordinated history decision. No provider rotation or history purge is claimed. |
| B92 | KYC files lived only inside the disposable API container. | Added durable upload storage and a backup/migration/restore procedure. | Upload/recreation/restore verification and an inventory of already-missing files. A volume cannot recover previously lost uploads. |
| B94 | Finance had APIs but no screen for unknown/blocked payment-link captures. | Added a bounded cross-merchant queue, original-identity retries, evidence-required release, role gates and refresh/error handling. | Browser role/action/error verification and real audit/concurrency checks. |
| B99 | The development Compose setup was also being used as a hosting configuration. | Added a separate production-mode overlay with supplied secrets, private database/API ports, secure cookies and built frontends behind HTTPS. | Image/routing/login acceptance. Hosting/deployment is excluded from the owner's current local-code scope. |
| B101 | Large-export and slow-report claims lacked representative measurements. | Synthetic streaming check completed 100005 rows in 101 reads; pause/cancel/error checks confirmed bounded fetching and connection release. | Real local Postgres query plans, representative load/memory measurements and any optimizations those measurements justify. Synthetic throughput is not a database benchmark. |

References: [current tasks](../tasks/todo.md), [verification notes](../tasks/verification.md),
[OTP delivery](../ops/otp-email.md), [KYC storage](../ops/kyc-storage.md),
[hosting preparation](../ops/hosting.md), and [refund/security handoff](security-refund-handoff.md).

## 10. Reclassified items: not implementation fixes

| ID | Why it is not listed as a completed product fix |
|---|---|
| B03 | The migration works and the affected accounts are unused; the remaining account-kind question needs finance direction. Removed as an active product defect. |
| B07 | Real card-provider integration is outside the agreed simulator demo scope. The simulator was not replaced by a real acquirer. |
| B08 | A recorded/demo payout is not proof of a bank transfer. Actual bank integration remains a separate scope decision. |
| B13 | Cache-only display adjustments are an accepted policy, not missing ledger postings. ADR-0011 preserves them through settlement refreshes until the next authoritative rebuild. |
| B54 | An unreferenced fixture file was not evidence of runtime data exposure. Reclassified as fixture hygiene. |
| B59 | The original jitter assertion is a test problem. It was not a product behavior to restore or weaken security for. |
| B60 | Cross-suite fixture contamination requires isolated databases/schemas. Sequential execution alone does not establish isolation; this was reclassified as test setup. |

## Verification and practical limits

Evidence comes from different passes and must retain its scope. The earlier
[security verification](security-remediation-verification.md) records targeted
tests against isolated disposable databases. The latest
[local verification notes](../tasks/verification.md) record typechecking,
isolated runtime checks and synthetic export observations; database-backed
checks in that session were blocked by unavailable Docker/Postgres.

The complete test suite is not claimed green. Missing database setup and
assertions preserving superseded behavior remain documented separately. Existing
test files were not rewritten to manufacture passing results. This documentation
pass does not rerun application tests or change runtime code.

No entry here implies historical repair: duplicate events, wrong imports,
missing residue, old tier pricing, lost uploads and previously rounded counters
need separately scoped evidence and remediation if existing data is affected.

Newer accepted ADRs and the latest implementation notes take precedence over
older checklist descriptions. In particular, ADR-0019 supersedes the earlier
client-clock expiry policy, defines the local raw-byte callback contract, and
authorizes removing the tier from new captures. It does not certify a real
provider's contract or authorize production changes.
