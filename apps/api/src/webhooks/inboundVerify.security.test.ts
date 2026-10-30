import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyAcquirerCallbackSignature } from "./inboundVerify.js";

test("unsigned and stale callbacks fail closed even with legacy flag false", () => {
  assert.equal(verifyAcquirerCallbackSignature({}, undefined, "secret", false).valid, false);
  const timestamp = Math.floor(Date.now() / 1000) - 301;
  const digest = createHmac("sha256", "secret").update(`${timestamp}.{}`).digest("hex");
  assert.equal(verifyAcquirerCallbackSignature({}, `t=${timestamp},v1=${digest}`, "secret", true).valid, false);
});

test("fresh authenticated callbacks pass and future timestamps outside tolerance fail", () => {
  const now = Math.floor(Date.now() / 1000);
  for (const timestamp of [now, now + 301]) {
    const digest = createHmac("sha256", "secret").update(`${timestamp}.{}`).digest("hex");
    assert.equal(verifyAcquirerCallbackSignature({}, `t=${timestamp},v1=${digest}`, "secret").valid, timestamp === now);
  }
});
