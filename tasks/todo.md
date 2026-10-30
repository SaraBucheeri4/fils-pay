# Two bug lists

Baseline: `10a1a31`, 2026-10-30. Implementation order, ownership and coordination
are in [plan.md](plan.md). Each open checklist ID appears in exactly one list.
These are pending tasks, not claims that the bugs were reproduced again.

## List A - authentication, callbacks and hosting

- [ ] **B92 - Persist KYC uploads across container recreation.** Mount durable
  storage at the configured upload path and document backup/restore. Done when
  a local uploaded document survives container recreation and a restore check;
  existing missing files are identified without claiming they can be recovered.
  Coordinate Compose changes with B99. Scope: medium.

- [x] **B97 - Reject malformed signature digests.** Require the expected 64 hex
  characters before decoding; check all callers of the shared helper. Done when
  valid digests verify and trailing junk, odd length and invalid hex fail,
  without weakening OTP or callback checks. No dependency on B23's body-format
  decision. Scope: small.

- [ ] **B09 - Deliver merchant and admin OTPs.** Integrate the selected provider
  with delivery-error handling and no production code disclosure. Done when
  both production-mode login flows can receive and verify OTPs, and existing
  expiry/resend behavior remains enforced. Needs provider selection and
  credentials. Scope: large; implement merchant delivery and then admin delivery
  as separately verifiable increments. Blocks B99's production-mode cutover.

- [ ] **B99 - Provide safe hosting configuration.** Add a hosting override with
  restricted database exposure, supplied secrets, production API mode, HTTPS
  and built frontend assets. Done when the merged Compose configuration has
  those properties and both login flows work in the local hosting setup.
  Depends on B09 before production mode is activated; incorporates B92 storage.
  Scope: large; separate configuration, serving and login verification.

- [ ] **B23 - Resolve the callback signed-body contract.** Confirm the provider's
  exact byte representation and record the approved contract before changing
  verification. Done when correctly signed callbacks in that representation
  work while missing, tampered and stale signatures still fail. Signature and
  freshness enforcement already exist. External dependency: provider contract;
  coordinate B97 and B53. Scope: medium after the decision.

- [ ] **B53 - Complete the exposed-secret follow-up.** Confirm whether the old
  value was used, obtain applicable provider rotation/revocation evidence and
  coordinate the repository-history decision. Done when the credential outcome
  is documented and the retired value remains rejected. Removal/fingerprint
  rejection already exist. External dependency; no unapproved history rewrite
  or provider-side mutation. Coordinate B23/B99.

## List B - merchant exports, finance UI and refunds

- [x] **B95 - Neutralize spreadsheet formulas in CSV text cells.** Protect
  formula-capable references/text in both export paths while preserving CSV
  escaping, streaming and genuine numeric amounts. Done when exported formula
  text is inert and negative monetary values remain valid numbers. Scope: small.

- [x] **B96 - Validate transaction IDs before database queries.** Apply consistent
  UUID validation to transaction routes taking an ID. Done when malformed IDs
  produce the chosen existing 400/404 convention without SQL errors, while
  ownership checks and legitimate IDs still work. Same owner as B95 to avoid
  transaction-route conflicts. Scope: small.

- [x] **B98 - Remove floating-point money from the batch progress display.**
  Remove the undefined bar or replace it with a clearly defined integer ratio.
  Done when the page has no float-derived money calculation and whole-fils
  formatting remains correct. Scope: small.

- [ ] **B94 - Add the blocked-capture console.** Give finance/super admins a
  bounded queue and the existing retry/release actions. Done when the screen
  lists blocked links across merchants, handles unresolved retries safely,
  requires confirmation evidence for release, refreshes after resolution and
  denies support mutations. Reuse ADR-0016 APIs and audit behavior; do not
  reimplement capture logic in the UI. Scope: large; queue first, then actions.

- [ ] **B93 - Resolve unapproved live volume-tier pricing.** Obtain written
  finance direction and a further ADR before removing or retaining the tier.
  Done when capture pricing matches that decision and historical recorded fees
  are preserved. External dependency: finance decision. B46's overflow fix and
  ADR-0016's historical-fee protection are already implemented. Scope: medium
  after the decision; no speculative pricing change while blocked.

- [ ] **B16 - Finish refund verification and release readiness.** Exercise the
  existing drawer, gated route, opt-in, ledger/fee reversals, settlement/carry,
  reports and signed delivery together, including ambiguous-response retries.
  Done when local end-to-end evidence exists and release prerequisites are
  documented for the operator. The wiring already exists; do not rebuild it or
  bulk-enable merchants. Hosted activation coordinates with A's B09/B23/B53/B99
  work and requires the operator's release decision. Scope: verification plus
  any defects actually discovered; local QA can start immediately.

## Implementation checkpoint — 2026-10-30

See [verification.md](verification.md) for the evidence and actual check results.
Four focused items above are complete. B92 storage, B94 screen, B09 Resend
delivery and B99 hosting preparation are implemented but remain unchecked
until their full runtime acceptance checks pass. B16 end-to-end refund QA is
blocked by the unavailable disposable database/Docker engine. Refunds stay off.

The owner selected Resend and temporary single-inbox routing in ADR-0017;
credentials are in ignored local configuration. B23 remains unresolved under
ADR-0012, B93 remains unresolved under ADR-0014, and B53 has no rotation evidence
in the designated sources. Re-reading those sources cannot supply the missing
provider/finance decisions. No speculative callback or pricing change was made.
