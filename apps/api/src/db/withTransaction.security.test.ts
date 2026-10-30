import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { withTransaction } from "./withTransaction.js";

test("rollback failure preserves the original exception and discards the client", async () => {
  const original = new Error("original");
  const rollback = new Error("connection lost");
  let released: unknown;
  const pool = { connect: async () => ({
    query: async (sql: string) => { if (sql === "ROLLBACK") throw rollback; },
    release: (error: unknown) => { released = error; },
  }) } as unknown as Pool;
  await assert.rejects(withTransaction(pool, async () => { throw original; }), (error) => error === original);
  assert.equal(released, rollback);
});
