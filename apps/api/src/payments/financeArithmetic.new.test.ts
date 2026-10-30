import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateFeeFils } from "../fees/estimate.js";
import { parsePromotionalDiscountFils } from "./discountAdjustment.js";
import { parseAdjustmentAmountFils } from "../admin/adjustmentCsvParsing.js";
import { monthBounds } from "../../../../scripts/reconcile_march.js";

test("BHD parsers preserve the third decimal and reject trailing input", () => {
  assert.equal(parseAdjustmentAmountFils("-4.759"), -4759);
  assert.equal(parsePromotionalDiscountFils("4.759"), 4759);
  for (const raw of ["1.0001", "4.75oops", "NaN"]) {
    assert.throws(() => parseAdjustmentAmountFils(raw));
    assert.throws(() => parsePromotionalDiscountFils(raw));
  }
});

test("fee rounding discounts gross before applying MDR", () => {
  // Discount rounds 1 fil away first; MDR then sees 1 fil and rounds .5 to even.
  assert.equal(estimateFeeFils(2, 5000, 5000), 0);
  assert.equal(estimateFeeFils(100_000, 250, 1000), 2250);
});

test("March bounds are Bahrain midnights with absolute UTC instants", () => {
  const bounds = monthBounds(2026, 3);
  assert.equal(bounds.start.toISOString(), "2026-02-28T21:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-03-31T21:00:00.000Z");
});
