# Two-workstream bug plan

Prepared 2026-10-30 against `10a1a31` after the history/checklist update
`9794c8e` and implementation fixes `c9f2c7a` were merged.

## Scope and evidence

The active backlog has 12 unchecked items: B09, B16, B23, B53 and B92-B99.
The two lists and their completion criteria are in [todo.md](todo.md).
This is a planning pass, not a fresh runtime audit or permission to deploy.

Sources reviewed: `project_bug_checklist.md`, `original_history.md` including
the new section 9, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/HANDOVER.md`, and
all records under `docs/adr/`. The checklist and history describe evidence;
only the designated architecture, handover and ADR records define intended
business behavior. Explicit ADR supersession remains applicable.

Current-code checks narrow three older descriptions:

- B16: the refund route, drawer and downstream wiring exist. The remaining work
  is verification and the release decision, not rebuilding the feature. The
  route returns 501 while `FEATURE_REFUNDS` is false, as intended.
- B23: signatures, timing-safe comparison and freshness are already enforced.
  The provider's signed-body representation remains unresolved under ADR-0012.
- B53: the tracked value was removed and its fingerprint is rejected. Provider
  rotation confirmation and the decision about repository history remain open.

The prior capture-review, refund retry, fee-journal and rebuild fixes are in
`c9f2c7a`/ADR-0016. B94 remains open because those fixes added APIs, not a console
screen. Release verification must exercise the recently changed logic.

## Workstream A: authentication, callbacks and hosting

Own B09, B23, B53, B92, B97 and B99. This keeps shared edits to configuration,
Compose, KYC storage and cryptographic verification under one owner.

Suggested order:

1. B92: persistent KYC storage and a backup/restore procedure.
2. B97: strict digest parsing in the shared comparison helper.
3. B09: deliver merchant and admin OTP through the selected provider.
4. B99: finish the hosting override after OTP delivery works in production mode.
5. B23/B53: request the provider decisions early; complete them when the signed
   contract and credential rotation evidence are available.

Hosting configuration can be prepared alongside B09, but switching the API to
production before OTP delivery works would lock users out. Keep development
and hosting settings distinct. Recreating the API must not discard existing
KYC files; copy/backup any existing files before a separately approved cutover.

Likely ownership: `ops/`, API authentication/notifier code, `config.ts`,
`lib/crypto.ts`, inbound callback verification and KYC storage configuration.
Any provider integration requires the selected provider and credentials; this
plan does not select one or authorize contacting anyone.

## Workstream B: merchant exports, finance UI and refund completion

Own B16, B93, B94, B95, B96 and B98. This keeps transaction/export routes and
the finance-facing UI together while A owns deployment and authentication.

Suggested order:

1. B95/B96: neutralize formula-capable text cells and reject malformed IDs.
2. B98: remove the meaningless money-derived progress bar or define an integer ratio.
3. B94: build the finance/super-admin capture-review console on the existing APIs.
4. B93: obtain a written finance decision before changing tier pricing; record
   it in a further ADR. Investigation can start immediately.
5. B16: verify the complete refund journey locally, then prepare release evidence
   for an operator decision. Do not enable the deployment flag during planning.

B94 should use the global queue at `GET /v1/admin/payment-links/capture-reviews`
and the existing per-merchant resolution endpoint. A release action must collect
`releaseEvidence`, added by ADR-0016. Keep support access read-only.

Likely ownership: transaction routes/export formatting, `apps/admin` capture
review screens, `apps/web` settlement/refund UI, tier pricing code and the
refund release evidence. Keep changes out of A's config and Compose files.

## Coordination and external decisions

- A owns hosting/configuration; B provides the intended refund flag/opt-in
  requirements. Local refund QA can start before hosting is ready; hosted
  activation waits for the agreed callback/security and hosting prerequisites.
- B93 is blocked on written finance direction. Preserve current tier-priced
  historical fee snapshots and do not change live pricing while waiting.
- B23 is blocked on the provider's signed-body contract. B97 can be fixed
  independently; do not describe it as resolving the body-format question.
- B53 needs external credential-use/rotation evidence. Any git-history rewrite
  is a separate coordinated operation requiring explicit authorization.
- If either stream needs a migration or a shared file outside its ownership,
  coordinate before editing. Keep applied migrations immutable and allocate
  any new migration numbers serially after checking the current tip.
- Update the original checklist only when each item and its dependent behavior
  have been verified. Neither stream should bulk-tick the other's work.

## Verification and checkpoints

No new tests and no edits to existing test files, per the owner's instruction.
Use existing checks plus manual local QA on isolated disposable data. Do not
relax security policy to make old fixtures pass.

After A's storage/signature fixes and B's export/ID/display fixes, run the
relevant existing checks and inspect the behavior directly. After OTP/hosting
and the capture-review screen, verify login and role-gated UI flows in a browser.
Before closing B16, verify capture/refund ledger entries, settlement/carry,
reports, notifications, opt-in and retry behavior together.

Final combined checks: `npm run typecheck`, both frontend builds, `npm test`,
and `go test -short ./...` from `apps/settlement` on Windows. Record absent
database coverage and every actual failure rather than calling the suite green.

`original_history.md` section 9 distinguishes tests preserving incorrect
behavior from genuine regressions and outdated fixtures. Keep those records;
do not restore UTC windows, unsigned callbacks, incorrect monetary units or
other superseded behavior merely to satisfy an assertion. B59 and B60 were
removed as product defects and are not extra implementation tasks. Removed
policy/scope items such as B13 and B17 are also outside these two lists.

No historical financial repair, external messaging, secret rotation, history
rewrite, schema deployment or hosted release is performed by creating this plan.

## Execution checkpoint — 2026-10-30

Implementation and verification results are in [verification.md](verification.md).
The owner subsequently selected Resend and authorized temporary OTP delivery to
one specified inbox (ADR-0017); two notifier smoke emails were accepted. This
does not authorize deployment or resolve the other external decisions. The
original source files and test-file restriction remain in force.
