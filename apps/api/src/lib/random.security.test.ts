import assert from "node:assert/strict";
import { test } from "node:test";
import { randomDigits, randomFromAlphabet } from "./random.js";

test("security randomness does not depend on Math.random", () => {
  const previous = Math.random;
  Math.random = () => { throw new Error("insecure randomness"); };
  try {
    assert.match(randomDigits(6), /^\d{6}$/);
    assert.match(randomFromAlphabet("ABC", 32), /^[ABC]{32}$/);
  } finally { Math.random = previous; }
});
