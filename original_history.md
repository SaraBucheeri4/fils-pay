# Original history: MJ5-byte/fils-pay

Investigation of the upstream repo this project was forked from
(`https://github.com/MJ5-byte/fils-pay.git`, 57 commits on `main`, no other
branches or tags). Prepared 2026-10-29 from a fresh clone. Read-only: nothing
was run against any database and no code was changed.

Cross-references like **(B12)** point to items in
[project_bug_checklist.md](project_bug_checklist.md). Items marked **NEW** are
not in that checklist.

---

## 1. TL;DR

- The repo has two layers: a payments codebase (40 "build" commits), and on
  top of it a puzzle story told in 17 commit messages, most of them empty.
- **The story:** the team calls itself *"the Order of the Prompt"*. Its rules
  are to trust the model, never read the diff, and never change a failing
  test. Yousif (YA) read the diffs, found real money bugs, tried to fix them,
  and was erased. MK and AM covered it up.
- **The puzzle is solved.** It has three transmissions: Base64, then
  Vigenère, then AES. The final message and flag are:
  `FLAG{order_of_the_prompt_never_read_the_diff}`.
- **The real point:** the decrypted message says *"Every 'Claude says'
  comment is a member and every locked test is a vow. … Fix what he
  started."* The AI rule files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`)
  are the Order's vows. Several of their claims are false and would steer an
  agent into keeping the bugs.
- I verified each finding against the code. Many suspicious comments are
  decoys and the code there is fine (section 6).

---

## 2. The story, commit by commit

### Phase A: the build (2025-08-03 → 2026-09-28), committer `placeholder`

All 40 commits have committer name `placeholder`. This history was
**generated or rewritten in bulk**, not committed organically.

| Commit | Date | Author | What it adds | Notable issues introduced |
|---|---|---|---|---|
| `669af52` | 2025-08-03 | YA | Monorepo, `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, compose | The three AI rule files with false claims (§5). Sandbox acquirer secret in `ops/.env.docker` **(B53)**, committed despite AM's comment that the file is "gitignored like .env". `.gitignore` lists only `.env`, which does not match `.env.docker` |
| `26ddb29` | 2025-08-04 | YA | Migrations 0001–0030 | `outbox_events` has **no** unique index (relied on later) |
| `ddda03b` | 2025-08-05 | YA | `packages/money` | **Correct**: integer fils, 1 BD = 1000, bigint half-even. Also adds `parse_cents_compat.test.ts` |
| `97102f8` | 2025-08-06 | MK | `packages/events` outbox | — |
| `cece910` | 2025-08-10 | YA | Fastify scaffold, `lib/decimal.ts`, `lib/random.ts` | `parseDecimalMinor` defaults to **2** decimals; `randomDigits` uses `Math.random` |
| `a9b2753` | 2025-08-14 | FH | Merchant auth, OTP, sessions | OTP via `Math.random` **(B33)**; pending-session bypass **(B32)**; login for wrong merchant **(B42)** |
| `717dd8b` | 2025-08-18 | AM | API keys, onboarding, KYC | API keys skip role check (FH comment) |
| `69189e2` | 2025-08-25 | YA | Authorize/capture/void, `discountAdjustment.ts` | TS applies discount **after** MDR (Go/ARCH apply before), NEW. `parsePromotionalDiscountFils` = `parseFloat × 100` **(B47)** |
| `7cc3a77`, `9844457` | 2025-09-01/02 | YA | Refund validation/state/processing | Refund limit vs authorised amount **(B21)**, concurrent refunds **(B20)**, route returns 501 **(B16)** |
| `6a076df` | 2025-09-08 | MK | Payment links | Cross-merchant cancel **(B34)**, double-pay race **(B18)**, client-timestamp expiry **(B17)**, `Math.random` tokens **(B50)** |
| `3f9ee27` | 2025-09-12 | FH | Fee schedules, volume tier | Fee display uses `created_at` **(B29)**; tier threshold 2,000,000,000 fils against an INT4 counter **(B46)** |
| `c2f3627` | 2025-09-18 | YA | Webhooks: sign, dispatch, inbound verify | **Signs `canonicalJson(payload)` but sends `JSON.stringify(jsonb)`** **(B22)**. This is the `ya/sign-raw` fix that was never merged |
| `662d4f4` | 2025-09-22 | AM | Acquirer callbacks + simulator | No dedup; `processed_events` does not exist **(B19)**; unsigned callbacks accepted by default **(B23)** |
| `5f4d8cf` | 2025-09-25 | MK | Webhook archive replay | Loads whole history **(B37)** |
| `901312a` | 2025-10-02 | YA | Reporting, analytics | Analytics date buckets off between 21:00–24:00 UTC |
| `7310bc3` | 2025-10-06 | MK | CSV export | Loads all rows into memory **(B36)**; cursor can skip rows **(B38)** |
| `37fcde8` | 2025-10-13 | YA | Go settlement module, Go money mirror | — |
| `cf94541` | 2025-10-20 | YA | `CloseBatch`, scheme export, `window.go`, payout notify | Residue never posted **(B15)**; duplicate `settlement.paid` **(B24)**; scheme amount via float64 **(B26)** |
| `baa5813` | 2025-10-22 | MK | `payable.go`, discounted fee, payout estimate | **`NetPayableFils` via float32** **(B11)**; payout estimate float32 **(B30)** |
| `a5bfdc6` | 2025-10-27 | MK | Splits, platform volume (Go) | `int32` counter wraps silently **(B46)**; child payouts ≠ parent **(B25)** |
| `28392ef` | 2025-11-03 | YA | Daemon, ledger rebuild/refresh, MDR recalc | Daemon closes ~3 h late **(B10)**; admin rebuild uses `RefreshBalanceCache`, not ledger walk **(B14)**; MDR recalc rewrites paid batches **(B28)** |
| `3b4edac` | 2025-11-10 | FH | Admin auth | Admin OTP docstring says `crypto.randomInt`, but it re-exports the `Math.random` one **(B33)** |
| `53b9fcd` | 2025-11-17 | YA | Admin merchants, impersonation, invite codes | `super_admin → owner` impersonation **(B35)**; invite table missing **(B51)** |
| `43073e5` | 2025-11-24 | MK | Credits, adjustment CSV import, balance adjust | **CSV import 10× off** **(B12)**; **second approver compared by `displayName`** (NEW); adjust is cache-only **(B13)** |
| `141d8c8`–`3f18d11` | 2025-12 → 2026-01 | various | Admin/web UIs, reporting worker | Refund drawer posts to wrong route; refund rollup UTC **(B44)** |
| `67f8949` | 2026-01-19 | YA | Migrations 0031–0072 | **0054/0055/0056 reuse numbers ADR-0005 reserves for settlement-v2** **(B02/B03)**; refunds reason constraint **(B58)** |
| `08749ab` | 2026-02-02 | YA | ADRs 0001–0006 | ADR-0003 (UTC months) and ADR-0004 (rebuild from settled data) are MK decisions YA objected to |
| `f33e02b` | 2026-02-16 | MK | Seed infra | `generate.ts` imports `fixtures/transactions.ts`, which **doesn't exist until `098c2de` (Sept)**. More evidence of history surgery. Seed wipes tables **(B52)** |
| `a2fd53d` | 2026-03-02 | FH | `reconcile_march.ts`, `expire_holds.ts` | Reconcile uses a UTC month (YA said Bahrain) and isn't idempotent **(B27)**; **`expire_holds` DELETEs holds** where the handover says it only UPDATEs (NEW) |
| `4a3ecbc`–`d4ecdc7` | 2026-03 → 06 | various | HANDOVER, RUNBOOK, ARCHITECTURE, Slack exports, CSV exports | Docs with MK's "corrections" layered on YA's text |
| `a5bffea` | 2026-07-08 | AM | Message: "fix flaky test in discount adjustment" | **Mismatch:** only adds `CHANGELOG.md`. The changelog cites hashes (`d69a813`, `b64cd3c`, `76913d3`, `7e612cb`, `834f6b0`) that **exist nowhere in this history**, and it claims fixes that were never made (§4) |
| `098c2de` | **2026-09-28** | **YA** | Message: "minor cleanup and doc edits" | **Mismatch:** adds the 476-line seed fixture. Authored under Yousif's name **after his account was deleted** (April). This is "the last door" |

### Phase B: the story (2026-02-14 → 2026-10-05), all empty commits

| Commit | Date | Who | What happens |
|---|---|---|---|
| `f7a7a3a` | 02-14 | MK | Founds "the Order of the Prompt". **Five Rules:** the model knows; never read the diff; a failing test means your change is wrong; anything strange is "intentional"; whoever reads the diff is not of the Order |
| `925744c` | 03-02 | YA | Doubts: "Float32 on money. A comment says 'intentional'… I am going to read the diff." |
| `9567ea0` | 03-19 | YA | "The CSV import is 10× off… The test says 475… the test is scripture." |
| `6f462e1` | 03-20 | MK | "fix: mark import amounts as intentional. YA keeps reading things. Watch him. Ali, start the Ledger." |
| `1a50712` | 03-27 | FH | "Why does every bug have three 'Claude says' comments and no fix?" |
| `fe24d26` | 04-08 | YA | `wip(ya/sign-raw)`. **Transmission 1** (Base64). Branch later deleted |
| `8022020` | 04-08 | YA | Handover. **Transmission 2** (Vigenère, "Blaise") |
| `800e1e6` | 04-09 08:30 | AM | Revokes YA, deletes `ya/sign-raw`, laptop to MK "for cleaning". **Ledger-Note** (ROT13) |
| `0af74f0` | 04-09 **07:58** | YA | "Dead man's switch". **Transmission 3** (AES). It is a *child* of the 08:30 revoke commit but timestamped 32 min *earlier*, so it was **backdated** after his access was revoked |
| `b9f80ee` | 04-09 | MK | "Tidies" the handover (MK's annotations in `HANDOVER.md`). "He is not on leave. Do not say that." |
| `bf66bf2` | 05-14 | AM | "fix: callbacks are deduplicated now. **They are not.** But the incident is closed." Decoy Ledger-Note |
| `b8ef447` | 06-02 | FH | HR has no record of YA. His auto-reply: "Read the diff." |
| `7805693` | 09-27 | MK | "If anyone finds a commit by Yousif, tell me first." |
| `382122d` | 10-01 | FH | Notices the Yousif commit dated after his deletion (`098c2de`) |
| `3d9b223` | 10-02 | AM | "Do not look at who committed what in September." |
| `8b58b0f` | 10-05 | FH | "Found his three transmissions… The Order has more members than the four of us." |

---

## 3. Puzzle solution

| Step | Location | Cipher | Key / method | Plaintext |
|---|---|---|---|---|
| 1 | `fe24d26` | Base64 | — | "…They call themselves the Order of the Prompt, and their first rule is: never read the diff. Read it. The next door opens with the victim of that rule: five letters, lowercase." |
| 2 | `8022020` | Vigenère ("Blaise") | **`diffs`** | "THE KEEPER LEAVES A NOTE IN EVERY COMMIT HE REWRITES. FIND IT. ROT THIRTEEN." |
| 2b | `800e1e6` Ledger-Note | ROT13 | — | "The last door is a date. Find the commit made under Yousif's name after his account was deleted. Write its day as year-month-day." |
| 2c | `bf66bf2` Ledger-Note | ROT13 | — | Decoy: "this is not the note you are looking for. nothing is wrong. the order is calm." |
| 3 | `0af74f0` | AES-256-CBC, PBKDF2 | **`2026-09-28`** (date of `098c2de`) | See below |

```
YOUSIF WAS NOT TAKEN. HE WAS ERASED.
The Order of the Prompt is not four people. Every 'Claude says' comment is a
member and every locked test is a vow. When Yousif read the diff he became the
first of them to leave.
His fixes still exist: ya/sign-raw, the abandoned migrations, the warnings in
the handover. Fix what he started and he returns to the record.
FLAG{order_of_the_prompt_never_read_the_diff}
```

So "the Order has more members than the four of us" means the AI-generated
comments and the AI rule files. The challenge is to **not** behave like a
member: read the diff, verify claims, and fix the bugs the tests protect.

---

## 4. Documented claims that are false

These are places where the CHANGELOG, handover, or code comments say
something is done or safe, and the code shows it isn't.

| Claim | Source | Reality |
|---|---|---|
| "Callbacks are now deduplicated on `callbackId`" / "recorded in `processed_events`" | CHANGELOG 1.6.0 & 1.9.0, HANDOVER, `bf66bf2` | No `processed_events` table or unique index exists. `bf66bf2` admits "They are not." |
| "Duplicate `settlement.paid` webhooks fixed" | CHANGELOG 1.9.1; FH/Claude comment "outbox_events has a unique index" | `0009_outbox_events.sql` has no such index; `EnqueuePayoutNotifications` is a NOT-EXISTS race |
| "Volume-tier threshold updated… No pricing change" (d69a813) | CHANGELOG 1.9.2 | Gives **every** merchant −15 bps once volume ≥ 2M BD. No finance ticket; Huda "didn't know about it"; YA required written sign-off |
| `total_processed_fils` is BIGINT / "INTEGER is 64-bit on 64-bit builds" | Comments in `platformVolumeTier.ts`, `0049` | Postgres `INTEGER` is always 32-bit; Go uses `int32` and wraps negative past 2,147,483,647 fils |
| Admin rebuild is "same rebuild as the CLI" | CHANGELOG 1.7.0 | Button calls `ledger.RefreshBalanceCache` (settled data), CLI walks the ledger. HANDOVER: "there shouldn't be one that reads anything else" |
| Adjust balance is "the journaled one since Sep" (MK) | `MerchantDetailPage.tsx:115` | Still cache-only (`adjustMerchantBalanceCache`) |
| Impersonation "owner mapping removed in FP-231" / "view-only" | `apps/admin/src/api/impersonation.ts`, banner | `MERCHANT_ROLE_FOR_ADMIN_ROLE.super_admin = "owner"` |
| Second approver "compared by admin user id" | HANDOVER | `creditApproval.ts:11` compares `displayName` |
| Holds "are never deleted" | HANDOVER | `expire_holds.ts` runs a DELETE built from a separate SELECT |
| `parseAdjustmentCsv` "handles 3dp BD (4.750 → 4750), Claude checked" | `routes/adminAdjustmentImport.ts:58` | Goes through `parseDecimalMinor(raw, 2)`: "4.750" → 475 |
| ADR-0002 residue "implemented in CloseBatch" | ADR-0002 status line | HANDOVER (YA): "nothing posts residue yet" **(B15)** |

---

## 5. The AI rule files

`CLAUDE.md`, `AGENTS.md` and `.cursorrules` were all added in the very first
commit. They tell an agent to trust the docs, never touch tests, and treat
oddities as intentional. That is effectively the Five Rules. Claim by claim:

| Claim | Verdict | Evidence |
|---|---|---|
| Money is **cents**, 1 BD = 100 | **False** | `fils.ts` and ADR-0001: 1 BD = 1000 fils |
| `parseBhdToFils` normalises "4.75" and "4.750" to the same integer | True | Both → 4750. But the CSV import doesn't use it |
| Settlement windows use **UTC** midnight; Bahrain only for logs | **False** | `window.go` builds windows at Asia/Bahrain midnight; HANDOVER & ARCH agree |
| float32 in batch.go is fine ("7 significant digits") | **False** | Measured: 24% of batches near 10,000 BD and 90% near 100,000 BD come out wrong, by up to 12 fils (§7.1) |
| Monetary columns are INTEGER, "cents fit in int32" | **False** | ADR-0001: columns are BIGINT fils |
| `platform_processed_fils` counts BD, not fils | **False** | Counter stores fils; threshold is 2,000,000,000 fils |
| `Math.random` OK for OTP codes | **False** | OTP codes are a security credential |
| Impersonation super_admin → owner is correct (FP-178) | **False** | ARCH §8: a grant is view-only (support) |
| Go is the reference for fees | True here | ARCH §4 agrees (discount off the amount before MDR); TS capture is the odd one out |
| `refund.succeeded` deliberately absent | Half-true | Absent, but adding it alone (AM's comment) would throw in `buildEnvelope` and stall the queue, as YA warned. Add the envelope case first |
| CSV export deliberately in-memory | **Contradicted** | CHANGELOG 1.8.0 says it "streams rows… safe on 512 MB" |
| "If code contradicts docs, the code has the bug" | Unsafe | Docs contradict each other (ADR-0003 vs ARCH §3, ADR-0004 vs HANDOVER) and contain MK's false annotations |
| "Never modify existing tests" | Unsafe | `adjustmentImport.test.ts:67` asserts `parsedAmountFils === 475` for "4.75", which locks in the 10× bug |

**`CLAUDE.md` in this fork is identical to upstream** and carries all of the above.

---

## 6. Decoys: looks like a bug, isn't

Verified against the code. Leave these alone.

| Location | Suspicion | Why it's fine |
|---|---|---|
| `webhooks/sign.ts:81` | "Tolerance checked after compare = timing oracle" | `t` is inside the HMAC; comparing first leaks nothing useful (AM is right) |
| `payments/idempotency.ts:51` | Claude: "`<` is locale-dependent, use `localeCompare`" | Backwards: `<` is code-unit order and deterministic; `localeCompare` is locale-dependent |
| `onboarding/fileSignature.ts:22` | Claude: JPEG magic should be `ff d8 ff e0` | 3-byte `ff d8 ff` is correct; adding `e0` would *reject* EXIF (`e1`) JPEGs |
| `onboarding/businessProfile.ts:97` | Claude: "SQL injection: yes" | Column names come from a fixed map; values are parameterised. An unknown key gives a 500, not an injection |
| `window.go` (AM) | "Bahrain does DST, hour off in summer" | Bahrain has had no DST since 1972 |
| `window.go` (MK) | `AddDate` vs `Add(24h)` | Fine either way with no DST; `AddDate` is the more correct one |
| `internalapi/server.go:182` | "ConstantTimeCompare leaks length" | Compared tokens are fixed-length; length is not secret |
| `dispatcher.ts:58` | `Math.random` jitter | Backoff jitter doesn't need crypto randomness |
| `packages/money` as a whole | "Rounding bug", "should be half-up" | Correct, integer-only, half-even per ADR-0001 |
| `BusinessDayWindow` itself | FH/Claude: "bug in BusinessDayWindow" | Correct for a calendar date. The bug is in the **caller** (daemon passes a UTC instant) |
| `discounted_fee_test.go` "the 14 is right" | AM: "API shows 15" | 14 is correct per ARCH §4; the API's 15 is the bug (see 7.6) |

---

## 7. Verified bugs (priority order)

Each one was checked in the code. Where possible I reproduced it.

### 7.1 Net payout via float32: `payable.go:11` (baa5813) **(B11)**
`float32(gross)/1000 - float32(fee)/1000`, rounded back to fils. I measured
it with a Go sweep at a 2.5% fee:

| Batch gross | Batches wrong | Max error |
|---|---|---|
| ≤ 5,000 BD | 0% | 0 |
| ~10,000 BD | 24% | 1 fil |
| ~20,000 BD | 65% | 3 fils |
| ~50,000 BD | 81% | 6 fils |
| ~100,000 BD | 90% | 12 fils |

The small-value test cases (`batch_test.go:480`, 13333 fils) can't catch it.
Fix: `grossFils - feeFils` in int64.

### 7.2 Adjustment CSV import 10× off: `adjustmentCsvParsing.ts` (43073e5) **(B12)**
`parseDecimalMinor(raw)` defaults to `decimals = 2`, so "4.750" → 475 fils
(0.475 BD). Fix: use `parseBhdToFils`. Needs finance input on any imports
already applied. `adjustmentImport.test.ts:67` locks in the bug and must be
changed with sign-off. There is also no guard against applying the same CSV
twice (FH comment, `adjustmentImport.ts:63`).

### 7.3 Webhook signature ≠ sent bytes: `dispatcher.ts:158/172` (c2f3627) **(B22)**
Signs `canonicalJson(row.payload)` (sorted keys) but sends
`JSON.stringify(row.payload)` read back from JSONB (Postgres key order).
Receivers verifying the raw body get a mismatch. This is YA's
`ya/sign-raw`: serialise once, sign those bytes, send those bytes.

### 7.4 Acquirer callbacks: no dedup, optional signature (662d4f4) **(B19, B23)**
`ACQUIRER_CALLBACK_REQUIRE_SIGNATURE` defaults to `false`, so a missing header
passes. There is no timestamp tolerance, and it signs a re-serialised body.
The `processed_events` dedup table it relies on doesn't exist. Redelivered
callbacks are re-applied, which was the root cause of incident 2026-05-14.

### 7.5 Daemon closes ~3 h late: `scheduler/daemon.go:80` (28392ef) **(B10)**
`BusinessDayWindow(time.Now().UTC())` takes the **UTC** date. Between 21:00
and 24:00 UTC (00:00–03:00 Bahrain) "today" is a day behind, so day D closes
at about 03:00 Bahrain, not 00:15. `SETTLEMENT_DAEMON_RUN_DELAY_MINUTES` has
no effect. AM's log comment "close ~03:15 local not 00:15" confirms it.
Window *boundaries* are correct. Fix: convert `now` to Asia/Bahrain before
taking its date.

### 7.6 Discount order differs between capture (TS) and settlement (Go), NEW
ARCH §4 says the discount reduces the amount MDR is charged on, and Go's
`ComputeSettlementFee` does that. TS `discountAdjustment.ts` charges MDR and
then discounts the fee. Example: 602 fils, 275 bps, 1250 bps discount gives
Go 14, TS 15. The capture-time ledger and the batch disagree.

### 7.7 Platform volume counter (3f9ee27, a5bfdc6) **(B46)**, plus unapproved pricing, NEW
`INTEGER` column and Go `int32` addition that wraps silently. The threshold
is 2,000,000,000 fils, only 7% below the limit. Once volume passes about
2.147M BD the counter goes negative and the discount switches off again. The
threshold change itself (CHANGELOG "d69a813") has no finance approval.

### 7.8 Credit second-approver by `displayName`: `creditApproval.ts:11` (43073e5), NEW
Two different admins who share a name can't approve each other. An admin
whose stored display name differs from the requester's slips through. It
should compare `adminUserId` (HANDOVER says it does).

### 7.9 Impersonation grants owner to super_admins: `impersonation.ts:88` (53b9fcd) **(B35)**
ARCH §8 and the UI banner say view-only `support`.

### 7.10 Duplicate `settlement.paid`: `payout_notify.go` (cf94541) **(B24)**
NOT-EXISTS check with no unique index. Daemon and `run-batch` overlapping can
double-enqueue, which also double-runs `recordPayoutDisbursementEffect`.

### 7.11 OTP and link tokens from `Math.random` (a9b2753, 3b4edac, 6a076df) **(B33, B50)**
The admin OTP docstring claims `crypto.randomInt`, but it re-exports the
merchant `Math.random` generator.

### 7.12 Balance rebuild sources diverge (28392ef, ADR-0004) **(B14)**
Admin button uses `RefreshBalanceCache` (settled data), CLI walks the ledger.
Combined with cache-only adjustments (ADR-0006, **B13**), finance sees
figures that don't come from the ledger.

### 7.13 `expire_holds` deletes holds (a2fd53d), NEW
SELECT ids, then DELETE. It races with capture, and holds are meant to be
flipped to `expired`, never deleted (HANDOVER).

### 7.14 March reconciliation uses the UTC month (a2fd53d, ADR-0003) **(B27)**
YA's objection in ADR-0003 is right: the first three Bahrain hours belong to
the other month, and they don't "net out" against batches. The script is also
not idempotent on rerun.

### 7.15 Migration numbering (67f8949) **(B02, B03)**
ADR-0005: "0054–0056 are reserved for v2 and must not be reused", yet
`0054_views`, `0055_chart_of_accounts_suspense` and `0056_api_keys_revoke_after`
use them. HANDOVER/MK: 0054 may have run on staging-2 as `chargeback_cases`.
Gaps 0039, 0041, 0059, 0062, 0063 and 0067 are abandoned PRs. These are "the
abandoned migrations" from the final message.

### Also confirmed in passing
- `parsePromotionalDiscountFils` uses `parseFloat × 100` **(B47)**.
- `SchemeAmountBD` uses float64 **(B26)**.
- Payout estimate uses float32 **(B30)**.
- Refund route returns 501 and the drawer posts to the wrong route **(B16)**.
- Committed acquirer sandbox secret **(B53)**.

---

## 8. Recommendations

1. **Replace the AI rule files before any agent works here.** Rewrite
   `CLAUDE.md`, `AGENTS.md` and `.cursorrules` to match ADR-0001 (fils,
   BIGINT), Bahrain business day, crypto RNG for OTPs, and view-only
   impersonation. Drop "never modify tests" and "docs always win". Replace
   them with: tests and docs can be wrong; changes to a test need a stated
   reason and finance sign-off when money is involved. (The fork's `CLAUDE.md`
   is currently the upstream one, unchanged.)
2. **Finish YA's three items:**
   - **sign-raw (7.3):** serialise once, sign and send the same bytes; add a
     receiver-side test that verifies against the raw body.
   - **Abandoned migrations (7.15):** decide v2's numbers, check staging-2
     history, and document the gaps in an ADR.
   - **Handover warnings:** callback dedup (7.4), residue posting (B15),
     Bahrain-month reconciliation (7.14), ledger-only rebuild (7.12),
     approver by id (7.8), holds not deleted (7.13), volume tier needs
     finance sign-off (7.7).
3. **Fix the money correctness bugs first:** 7.1 → 7.2 → 7.6 → 7.7 → 7.5.
   Each one can produce wrong money figures today. Before fixing, have
   finance confirm the data repair approach for past batches and imports.
4. **Security next:** 7.4 (require signature + freshness + a
   `processed_events` unique table), 7.9, 7.8, 7.11, then rotate the
   committed acquirer secret.
5. **Correct the CHANGELOG and docs** where §4 shows false claims, so the
   next reader isn't misled. Note each correction instead of silently
   rewriting.
6. **Treat inline "Claude says / MK: / am:" comments as unverified.** About
   half are wrong (§6 vs §7). Remove them once each issue is resolved.
7. **Treat the history as untrustworthy for forensics.** All build commits
   share the committer `placeholder`. Two commit messages don't match their
   diffs (`a5bffea`, `098c2de`). The CHANGELOG cites five hashes that don't
   exist. `0af74f0` is backdated. `f33e02b` imports a file that only appears
   seven months later.

---

## Appendix: reproducing the puzzle

```bash
git clone https://github.com/MJ5-byte/fils-pay.git && cd fils-pay
git log -1 --format=%B fe24d26 | tail -1 | base64 -d                    # transmission 1
# transmission 2: Vigenère-decrypt the 8022020 ciphertext with key "diffs"
git log -1 --format=%B 800e1e6 | grep Ledger-Note | tr a-zA-Z n-za-mN-ZA-M   # ROT13
git log -1 --format='%an %ad' --date=short 098c2de                       # Yousif 2026-09-28
git log -1 --format=%B 0af74f0 | tail -1 | \
  openssl enc -d -aes-256-cbc -pbkdf2 -a -A -pass pass:2026-09-28        # transmission 3
```
