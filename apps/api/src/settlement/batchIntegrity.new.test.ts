import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { getBatchIntegrityReport } from "./query.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("batchIntegrity.new.test.ts requires DATABASE_URL");
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
test.after(() => pool.end());

/** One closed batch claiming one 10000-fils capture journaled at a 250 fee. */
async function fixture(frozen: { fee: number; net: number }) {
  const m = await pool.query<{ id: string }>(`INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`, [`Integrity ${randomUUID()}`]);
  const merchantId = m.rows[0]!.id;
  const b = await pool.query<{ id: string }>(
    `INSERT INTO settlement_batches (merchant_id, batch_date, status, gross_fils, fee_fils, net_payout_fils, closed_at)
     VALUES ($1, '2031-05-01', 'closed', 10000, $2, $3, now()) RETURNING id`, [merchantId, frozen.fee, frozen.net]);
  const t = await pool.query<{ id: string }>(
    `INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference) VALUES ($1, 'captured', 10000, 10000, $2) RETURNING id`,
    [merchantId, `acq-${randomUUID()}`]);
  const at = "2031-05-01T09:00:00Z";
  await pool.query(
    `INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type, occurred_at, settlement_batch_id) VALUES ($1, 'captured', 10000, 'system', $2, $3)`,
    [t.rows[0]!.id, at, b.rows[0]!.id]);
  const group = randomUUID();
  await pool.query(
    `INSERT INTO ledger_entries (entry_group_id, merchant_id, transaction_id, account_id, direction, amount_fils, occurred_at, description) VALUES
       ($1, $2, $3, 'card_scheme_clearing', 'debit', 10000, $4, 'capture ref'),
       ($1, $2, $3, 'merchant_payable', 'credit', 9750, $4, 'capture ref'),
       ($1, $2, $3, 'platform_fee_revenue', 'credit', 250, $4, 'capture ref')`,
    [group, merchantId, t.rows[0]!.id, at]);
  return merchantId;
}

const window = { from: "2031-05-01", to: "2031-05-02" };

test("a batch that matches its claimed activity is not reported", async () => {
  const merchantId = await fixture({ fee: 250, net: 9750 });
  const report = await getBatchIntegrityReport(pool, { merchantId, ...window });
  assert.equal(report.batchesChecked, 1);
  assert.deepEqual(report.mismatches, []);
});

test("a batch that paid without the journaled fee is reported", async () => {
  const merchantId = await fixture({ fee: 0, net: 10000 });
  const report = await getBatchIntegrityReport(pool, { merchantId, ...window });
  assert.equal(report.mismatches.length, 1);
  assert.deepEqual(report.mismatches[0]!.actual, { grossFils: 10000, feeFils: 0, netPayoutFils: 10000 });
  assert.deepEqual(report.mismatches[0]!.expected, { grossFils: 10000, feeFils: 250, netPayoutFils: 9750 });
});
