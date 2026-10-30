import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { buildTransactionsExportCsv } from "./exportCsv.js";

test("the CSV writes occurred_at in Bahrain time with an explicit offset (ADR-0020)", async () => {
  const pool = {
    query: async () => ({
      rows: [{
        id: "tx-1", status: "captured", amount_fils: "4750", captured_fils: "4750",
        reference: null, occurred_at: new Date("2026-10-30T21:30:00.000Z"),
      }],
    }),
  } as unknown as Pool;
  const [, line] = (await buildTransactionsExportCsv(pool, { merchantId: "m-1" })).split("\n");
  assert.equal(line?.split(",").at(-1), "2026-10-31T00:30:00.000+03:00");
});
