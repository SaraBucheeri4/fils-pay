import assert from "node:assert/strict";
import { test } from "node:test";
import { completedBahrainDate, dateTime } from "../apps/admin/src/format.js";

test("the admin default is the last completed Bahrain day across the UTC boundary", () => {
  // 00:30 Bahrain on Oct 31 is still Oct 30 in UTC.
  assert.equal(completedBahrainDate(Date.parse("2026-10-30T21:30:00Z")), "2026-10-30");
  assert.equal(completedBahrainDate(Date.parse("2026-10-31T09:00:00Z")), "2026-10-30");
  assert.equal(completedBahrainDate(Date.parse("2026-03-31T21:00:00Z")), "2026-03-31");
});

test("admin timestamps render in Bahrain whatever the process timezone is", () => {
  assert.match(dateTime("2026-10-30T21:30:00Z"), /31\/10\/2026.*00:30:00/);
});
