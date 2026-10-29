/**
 * B61: on a night with no expired holds, the cleanup must not delete
 * anything. buildWhere skips empty arrays, so an empty id list used to
 * produce an unfiltered `DELETE FROM holds`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExpiredHoldsDelete } from "./expire_holds.js";
import { buildDelete } from "./lib/sqlFilter.js";

/** A fix may either refuse to build the statement or build one with a filter. */
function assertNeverUnfiltered(build: () => { text: string; values: unknown[] } | null | undefined): void {
  let statement: { text: string; values: unknown[] } | null | undefined;
  try {
    statement = build();
  } catch {
    return; // refusing to build is acceptable
  }
  if (statement == null) return;
  assert.match(statement.text, /\bWHERE\b/, `unfiltered delete produced: ${statement.text}`);
}

test("an empty expired-hold list never produces an unfiltered DELETE", () => {
  assertNeverUnfiltered(() => buildExpiredHoldsDelete([]));
});

test("buildDelete never produces an unfiltered DELETE from an empty filter", () => {
  assertNeverUnfiltered(() => buildDelete("holds", { id: [] }));
  assertNeverUnfiltered(() => buildDelete("holds", {}));
});
