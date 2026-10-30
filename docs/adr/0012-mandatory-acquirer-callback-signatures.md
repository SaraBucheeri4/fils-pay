# 0012. Acquirer callback signatures are mandatory

- **Status:** Accepted; signed-body open question superseded by ADR-0019 for the local implementation
- **Date:** 2026-10-30
- **Decider:** Repository owner, explicit approval in this session
- **Related:** ARCHITECTURE (settings), B23, B53

Every acquirer callback must carry a current, valid signature.
`ACQUIRER_CALLBACK_REQUIRE_SIGNATURE` is a legacy setting and cannot disable
verification. This records the ARCHITECTURE settings change made for B23.

**Open:** the acquirer's signed body format is not documented in this
repository. Verification currently uses re-serialized JSON, so a signed body
whose bytes differ from that form is rejected. The format must be confirmed with
the acquirer and recorded in a further ADR before this changes. B23 stays open
until then.
