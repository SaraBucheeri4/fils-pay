# 0020. Bahrain time in exports, inputs and operator output

- **Status:** Accepted; implemented (B110-B113)
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit instruction in this session
- **Extends:** 0007 decision 2. It supersedes nothing.
- **Related:** B110, B111, B112, B113

## Context

ADR-0007 requires Bahrain windows, UI date defaults and displayed timestamps. It
did not say whether a downloaded file counts as display, so the transaction CSV
stayed in UTC. A few console date inputs and log date stamps also still use the
browser's zone or UTC. Asked about the CSV, the owner answered: always use Bahrain
time, which is UTC+3.

## Decision

1. Anything a person reads or enters uses Asia/Bahrain (UTC+3, no DST): pages, date
   and time inputs and their defaults, CSV and other file exports, monitoring
   dashboards, and date stamps in operator logs.
2. A timestamp in a CSV is the same instant written with an explicit offset, for
   example `2026-10-30T21:51:17.123+03:00`. Never drop the offset, and never add
   three hours to a stored value.
3. A date or time input means Bahrain wall time whatever zone the browser is in.
4. Unchanged:
   - Stored timestamps remain absolute instants (ADR-0007).
   - JSON API and webhook payloads may keep serializing instants in UTC, as
     ADR-0007 allows, because integrators parse them and an instant is unambiguous.
   - The scheme file format (ADR-0002).
5. UTC calendar dates are never used for a window, a date default or a date label.

## Consequences

- The CSV `occurred_at` text changes while the instant does not. A consumer that
  matches a trailing `Z` needs updating.
- This authorizes no historical repair. Credits already posted on a browser-local
  effective date stay as posted.
- Tests that require UTC boundaries do not define the rule, and they stay unedited
  as ADR-0007 and `original_history.md` section 9 record.
