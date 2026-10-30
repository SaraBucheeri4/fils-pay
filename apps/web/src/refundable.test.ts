import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRefundAmountFils, remainingRefundableFils } from "./pages/transactions/refundable.js";

test("what can be refunded is captured minus refunded, on refundable statuses only", () => {
  assert.equal(remainingRefundableFils({ status: "captured", capturedFils: 4759, refundedFils: 0 }), 4759);
  assert.equal(remainingRefundableFils({ status: "partially_refunded", capturedFils: 4759, refundedFils: 1001 }), 3758);
  assert.equal(remainingRefundableFils({ status: "refunded", capturedFils: 4759, refundedFils: 4759 }), 0);
  assert.equal(remainingRefundableFils({ status: "authorized", capturedFils: 0, refundedFils: 0 }), 0);
});

test("the refund form reads BD text as exact fils (ADR-0001)", () => {
  assert.equal(parseRefundAmountFils("", 4759), undefined);
  assert.equal(parseRefundAmountFils("1.001", 4759), 1001);
  assert.equal(parseRefundAmountFils("4.75", 4759), 4750);
});

test("the refund form rejects bad amounts before calling the API", () => {
  for (const bad of ["0", "4.760", "1.0001", "abc", "-1"]) {
    assert.throws(() => parseRefundAmountFils(bad, 4759), `${bad} must be rejected`);
  }
});
