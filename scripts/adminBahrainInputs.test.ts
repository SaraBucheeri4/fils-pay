import assert from "node:assert/strict";
import { test } from "node:test";
import { bahrainInputToIso, bahrainInputValue, bahrainToday } from "../apps/admin/src/format.js";

test("the credit default is today's Bahrain date across the UTC boundary", () => {
  assert.equal(bahrainToday(Date.parse("2026-10-30T20:59:00Z")), "2026-10-30");
  assert.equal(bahrainToday(Date.parse("2026-10-30T21:00:00Z")), "2026-10-31");
});

test("replay window inputs round-trip as Bahrain wall time", () => {
  const ms = Date.parse("2026-10-30T21:30:00Z");
  assert.equal(bahrainInputValue(ms), "2026-10-31T00:30");
  assert.equal(bahrainInputToIso("2026-10-31T00:30"), "2026-10-30T21:30:00.000Z");
});
