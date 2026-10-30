import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBahrainInstant, formatIsoDate } from "./dateFormat.js";

test("log date stamps use the Bahrain date across the UTC boundary", () => {
  assert.equal(formatIsoDate(new Date("2026-10-30T20:59:59Z")), "2026-10-30");
  assert.equal(formatIsoDate(new Date("2026-10-30T21:00:00Z")), "2026-10-31");
});

test("a Bahrain instant keeps its offset and parses back to the same moment", () => {
  const instant = new Date("2026-10-30T18:51:17.123Z");
  const text = formatBahrainInstant(instant);
  assert.equal(text, "2026-10-30T21:51:17.123+03:00");
  assert.equal(new Date(text).getTime(), instant.getTime());
});
