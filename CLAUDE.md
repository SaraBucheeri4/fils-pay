# FilsPay: YA-attributed guidance

This guide limits historical business guidance to statements attributed to
Yousif Al-Ansari (YA), with their sources. Attribution is not proof of
authorship or correctness: the history is constructed, HANDOVER was moved
and annotated by MK, and ARCHITECTURE explicitly lists later editors.
Nothing below claims that YA wrote this replacement guide.

## YA's stated approach

- **Exact money:** YA questions float32 money in commit `925744c`.
  In `9567ea0`, he explicitly says 4.75 BD is 4750 fils, not 475.
  The money implementation attributed to him in `ddda03b`
  (`packages/money/src/fils.ts`) uses integer fils, exact text parsing,
  half-to-even rate rounding and remainder allocation. These are supported
  by the implementation, not inferred from a reassuring comment.
- **Written finance evidence:** HANDOVER, People: "Huda knows the numbers.
  Trust what she sends in writing over what anyone remembers her saying."
  This is YA's stated preference; no unavailable finance contract is assumed
  to have been checked. ADRs and ARCHITECTURE have multiple contributors
  and must not be represented as exclusively YA's decisions.
- **Settlement dates:** HANDOVER, Timezone: the business day is Asia/Bahrain,
  with no DST. In ADR-0003's YA note dated 2026-03-02, he objects to UTC
  monthly reconciliation: windows compared against batches must use the
  same day. The accepted UTC-month decision is MK's, not YA's.
- **Ledger-based balances:** HANDOVER, Balances: the CLI reads the ledger;
  YA says there should not be a console rebuild reading another source.
  ADR-0004's later settled-data rebuild is MK's decision, not YA's.
- **Scheme residue:** HANDOVER, Scheme residue: YA describes posting residue
  inside CloseBatch as unfinished. ADR-0002's "implemented" status conflicts
  with that statement and with the missing posting in the reviewed code.
- **Webhook bytes:** HANDOVER, Webhook signing: "The dispatcher should sign
  exactly the bytes it sends." `fe24d26` mentions sign-raw, but is an empty
  commit; it does not contain the claimed fix.
- **Holds:** HANDOVER, Holds: YA describes marking active holds expired with
  an UPDATE and retaining the rows. The original upstream script instead
  deleted rows; the fork subsequently changed the script. Treat the
  handover as a stated approach, not proof of historical implementation.
- **Unfinished work:** HANDOVER, Not finished: YA identifies per-service DB
  roles/TLS and outbox consumption by commit order instead of sequence ID
  as unfinished. The reference to an external gist does not establish that
  its proposed implementation exists in this repository.
- **Platform tier approval:** HANDOVER, Platform volume tier: YA requires
  written finance sign-off before introducing the tier. His separate claim
  that INTEGER is safe "while it's only a counter" is not reliable evidence
  of adequate capacity for cumulative fils.

## Contradictions in YA-attributed statements

These are historical claims to investigate, not instructions to reproduce
the current behavior or permission to change financial/security logic.

| YA-attributed claim | Conflicting evidence |
|---|---|
| `transport.ts` said private-IP blocking already prevents SSRF. | `webhooks/create.ts` checks URL scheme, not resolved private addresses. Transport follows redirects and has no response-byte cap. The false comment has been removed; behavior is unchanged. |
| HANDOVER says the daemon's UTC date selection is harmless. | `scheduler/daemon.go` passes a UTC date into the Bahrain date-label helper; early local-morning runs can select the wrong day. The helper itself is correct. |
| HANDOVER says impersonation is support-only and read-only. | `admin/impersonation.ts` maps finance/super_admin to finance/owner; transaction write routes do not enforce a read-only impersonation scope. |
| HANDOVER says second approvers are compared by admin user ID. | `admin/creditApproval.ts` compares display names. |
| HANDOVER says credit effective dates are metadata and ledger rows use now(). | `admin/credits.ts` posts at Bahrain midnight of the selected effective date. |
| HANDOVER says callbacks are deduplicated in processed_events. | `acquirer/callbacks.ts` appends notes; the claimed dedupe table/constraint is absent from the reviewed migrations. |
| HANDOVER says apps/api/src/v1 is the live partner API. | `app.ts` registers `routes/transactions.ts`, not `v1/routes/transactions.ts`. |
| HANDOVER calls refund helpers done and says partial fee reversals sum to the original fee. | Refund amount/concurrency defects remain; independently rounding each partial does not guarantee cumulative fee conservation. The route still returns 501. |
| HANDOVER says there is no console balance-rebuild button. | The current admin routes expose one. The historical statement does not describe the current fork. |

The previous guide's blanket document precedence, fee-discount ordering,
crypto policy, test-failure counts and approval conventions were not shown
to be exclusively YA-authored. They are not attributed to him here.
Existing user instructions and approval requirements still apply; this
historical guide does not supersede them or resolve conflicting contracts.
