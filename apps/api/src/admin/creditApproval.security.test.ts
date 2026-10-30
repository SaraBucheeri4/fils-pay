import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDistinctApprover } from "./creditApproval.js";

test("credit two-person control uses immutable user identity", () => {
  assert.throws(() => assertDistinctApprover(
    { adminUserId: "one", displayName: "old" }, { adminUserId: "one", displayName: "new" },
  ));
  assert.doesNotThrow(() => assertDistinctApprover(
    { adminUserId: "one", displayName: "same" }, { adminUserId: "two", displayName: "same" },
  ));
});
