# 0014. MDR recalculation ignores the volume tier

- **Status:** Accepted; interim pending finance
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit approval in this session
- **Related:** HANDOVER (platform volume tier), ARCHITECTURE (settlement), B46, B89

HANDOVER requires written finance sign-off for a platform volume tier, and
ARCHITECTURE does not list a tier as a rate source. No sign-off is recorded.

MDR recalculation does not apply the tier, so a platform-wide threshold cannot
create corrections on batches whose merchant terms did not change. Pricing an
event with no recorded fee does not apply it either.

**Open:** capture still applies the existing tier. Removing it changes live
pricing and needs finance's written decision, recorded in a further ADR.
