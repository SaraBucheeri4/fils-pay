import assert from "node:assert/strict";
import test from "node:test";
import type { VolumePointDto } from "../../types.js";
import {
  addDays,
  bestDay,
  capturedTotalFils,
  captureStreak,
  latestPoint,
  percentOf,
  refundFreeDays,
} from "./overviewStats.js";

function point(date: string, capturedGrossFils: number, refundCount = 0): VolumePointDto {
  return {
    date,
    capturedCount: capturedGrossFils > 0 ? 1 : 0,
    capturedGrossFils,
    voidedCount: 0,
    refundCount,
    refundGrossFils: 0,
  };
}

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("capturedTotalFils sums exact integer fils", () => {
  assert.equal(capturedTotalFils([point("2026-08-01", 1), point("2026-08-02", 2999)]), 3000);
  assert.equal(capturedTotalFils([]), 0);
});

test("latestPoint and bestDay do not depend on response order", () => {
  const points = [point("2026-08-03", 50), point("2026-08-01", 900), point("2026-08-02", 900)];
  assert.equal(latestPoint(points)?.date, "2026-08-03");
  assert.equal(bestDay(points)?.date, "2026-08-01");
});

test("bestDay ignores a window with no captured volume", () => {
  assert.equal(bestDay([point("2026-08-01", 0)]), null);
  assert.equal(latestPoint([]), null);
});

test("captureStreak stops at a missing day or a day with no capture", () => {
  assert.equal(captureStreak([]), 0);
  assert.equal(captureStreak([point("2026-08-01", 5), point("2026-08-02", 5), point("2026-08-03", 5)]), 3);
  assert.equal(captureStreak([point("2026-08-01", 5), point("2026-08-03", 5)]), 1);
  assert.equal(captureStreak([point("2026-08-01", 5), point("2026-08-02", 0)]), 0);
});

test("refundFreeDays counts back to the last refund, or across the whole span", () => {
  assert.equal(refundFreeDays([]), 0);
  assert.equal(refundFreeDays([point("2026-08-01", 5), point("2026-08-04", 5)]), 4);
  assert.equal(refundFreeDays([point("2026-08-01", 5, 1), point("2026-08-04", 5)]), 3);
  assert.equal(refundFreeDays([point("2026-08-04", 5, 1)]), 0);
});

test("percentOf clamps and tolerates an empty whole", () => {
  assert.equal(percentOf(1, 0), 0);
  assert.equal(percentOf(845, 1000), 85);
  assert.equal(percentOf(2000, 1000), 100);
});
