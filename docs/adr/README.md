# Architecture decision records

One file per decision. Never edit an accepted ADR's decision; write a new
one that supersedes it and update the status line of the old one.

| # | Title | Status | Date |
|---|---|---|---|
| 0001 | [Money is integer fils everywhere](0001-integer-fils.md) | Accepted | 2025-10-02 |
| 0002 | [Journal scheme rounding residue at export](0002-scheme-residue-at-export.md) | Accepted, implemented | 2025-11-20 |
| 0003 | [Date windows for reports and finance scripts](0003-report-date-windows.md) | Superseded by 0007 | 2026-02-26 |
| 0004 | [Balance cache rebuild source](0004-balance-rebuild-source.md) | Superseded by 0007 | 2026-05-30 |
| 0005 | [Settlement v2 and the shadow ledger](0005-settlement-v2-shadow-ledger.md) | Proposed (paused) | 2026-05-18 |
| 0006 | [Adjustments are display corrections, not postings](0006-display-adjustments.md) | Accepted | 2026-05-04 |
| 0007 | [Approved settlement corrections and Bahrain time](0007-approved-settlement-corrections.md) | Accepted; implemented, no historical repair | 2026-10-30 |
| 0008 | [Admin security and webhook retention](0008-admin-security-and-webhook-retention.md) | Accepted | 2026-10-30 |
| 0009 | [Refunds require explicit merchant opt-in](0009-refund-enablement.md) | Accepted | 2026-10-30 |
| 0010 | [Negative settlement carry](0010-refund-settlement-carry.md) | Accepted | 2026-10-30 |
| 0011 | [Display adjustments last until a rebuild](0011-display-adjustments-survive-settlement.md) | Accepted | 2026-10-30 |
| 0012 | [Acquirer callback signatures are mandatory](0012-mandatory-acquirer-callback-signatures.md) | Accepted | 2026-10-30 |
| 0013 | [Unknown capture outcomes block a payment link](0013-payment-link-unknown-capture-outcome.md) | Accepted | 2026-10-30 |
| 0014 | [MDR recalculation ignores the volume tier](0014-volume-tier-excluded-from-recalculation.md) | Accepted; interim pending finance | 2026-10-30 |
| 0015 | [Who enables refunds for a merchant](0015-refund-opt-in-administration.md) | Accepted | 2026-10-30 |
| 0016 | [Review safety and accounting](0016-review-safety-and-accounting.md) | Accepted | 2026-10-30 |
