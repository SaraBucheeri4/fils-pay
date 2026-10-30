import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { resolveReportMerchantId } from "./scope.js";

test("report child scope includes the authenticated parent and rejects strangers", async () => {
  const pool = { query: async (sql: string, params: string[]) => {
    assert.match(sql, /parent_merchant_id = \$2/);
    assert.deepEqual(params, ["child", "parent"]);
    return { rows: [] };
  } } as unknown as Pool;
  await assert.rejects(resolveReportMerchantId(pool, "parent", "child"));
});
