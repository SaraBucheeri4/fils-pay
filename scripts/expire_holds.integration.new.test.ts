/**
 * B61: the nightly hold expiry marks only active, past-due holds as
 * 'expired' and never deletes a row. Runs inside a transaction that is
 * rolled back. Requires DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { EXPIRE_HOLDS_SQL } from "./expire_holds.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("expire_holds.integration.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
}

const pool = new Pool({ connectionString: databaseUrl, max: 2 });

test.after(async () => {
  await pool.end();
});

test("only active, past-due holds become expired; nothing is deleted", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const merchant = await client.query<{ id: string }>(
      `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
      [`Hold Expiry Merchant ${randomUUID()}`],
    );
    const merchantId = merchant.rows[0]!.id;

    const insertHold = async (status: string, expiresIn: string): Promise<string> => {
      const row = await client.query<{ id: string }>(
        `INSERT INTO holds (merchant_id, amount_fils, status, expires_at)
         VALUES ($1, 1000, $2, now() + $3::interval) RETURNING id`,
        [merchantId, status, expiresIn],
      );
      return row.rows[0]!.id;
    };
    const abandoned = await insertHold("active", "-1 hour");
    const stillValid = await insertHold("active", "1 hour");
    const released = await insertHold("released", "-1 hour");

    await client.query(EXPIRE_HOLDS_SQL);
    // A second run on the same night must change nothing more.
    const rerun = await client.query(`${EXPIRE_HOLDS_SQL} AND merchant_id = $1`, [merchantId]);
    assert.equal(rerun.rowCount, 0);

    const rows = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM holds WHERE merchant_id = $1`,
      [merchantId],
    );
    const status = new Map(rows.rows.map((r) => [r.id, r.status]));
    assert.equal(status.size, 3, "no hold may be deleted");
    assert.equal(status.get(abandoned), "expired");
    assert.equal(status.get(stillValid), "active");
    assert.equal(status.get(released), "released");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
