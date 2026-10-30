# 0009. Refunds require explicit merchant opt-in

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit answer in this session
- **Related:** B90, B16, migration 0052

`merchants.refunds_enabled` is an opt-in, not a pause switch.

| Value | Refund authorization |
|---|---|
| true | Allowed, subject to all other refund safeguards |
| false | Denied |
| NULL | Denied |

Preserve existing NULL rows. Do not bulk-enable merchants. The historical
migration note and prior helper behavior do not establish this policy.
Route activation still requires verified capture/refund accounting,
settlement, webhook delivery and reporting integration. Settlement v2 remains paused.
