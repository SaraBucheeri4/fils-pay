import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { toFils } from "@filspay/money";
import type { AcquirerSimulator } from "../acquirer/types.js";
import { processRefund } from "./processRefund.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("refundSafety.financial.new.test.ts requires a migrated disposable DATABASE_URL");
const pool = new Pool({ connectionString: databaseUrl, max: 6 });
test.after(async () => { await pool.end(); });

function acquirer(beforeApprove: () => Promise<void> = async () => {}) {
  let calls = 0;
  const service: AcquirerSimulator = {
    async authorize() { throw new Error("unused authorize"); },
    async capture() { throw new Error("unused capture"); },
    async refund(request) {
      calls++;
      await beforeApprove();
      return { outcome: "approved", acquirerReference: request.acquirerReference, latencyMs: 0 };
    },
  };
  return { service, calls: () => calls };
}

async function fixture(authorized: number, captured: number) {
  const merchantId = randomUUID();
  const transactionId = randomUUID();
  await pool.query(`INSERT INTO merchants (id, display_name, refunds_enabled) VALUES ($1, 'refund safety fixture', true)`, [merchantId]);
  await pool.query(
    `INSERT INTO transactions (id, merchant_id, status, amount_fils, captured_fils, acquirer_reference)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [transactionId, merchantId, authorized === captured ? "captured" : "partially_captured", authorized, captured, randomUUID()],
  );
  const actor = { type: "merchant_api_key" as const, id: randomUUID() };
  return {
    transactionId, merchantId,
    refund(service: AcquirerSimulator, amount: number) {
      return processRefund(pool, service, { transactionId, merchantId, actor, amountFils: toFils(amount), idempotencyKey: randomUUID() });
    },
  };
}

test("fully refunding a partial capture cannot reopen the unspent authorization for refunds (B65)", async () => {
  const f = await fixture(1_000, 400);
  const a = acquirer();
  assert.equal((await f.refund(a.service, 400)).statusCode, 200);
  const second = await f.refund(a.service, 1);
  assert.ok(second.statusCode >= 400, JSON.stringify(second.body));
  assert.equal(a.calls(), 1, "rejected refunds must never reach the acquirer");
  const state = await pool.query(`SELECT refunded_fils::text FROM transactions WHERE id = $1`, [f.transactionId]);
  assert.equal(state.rows[0]!.refunded_fils, "400");
});

test("competing refunds cannot send more than captured funds to the acquirer", async () => {
  const f = await fixture(1_000, 1_000);
  let entered!: () => void;
  const firstEntered = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const a = acquirer(async () => { entered(); await gate; });
  const first = f.refund(a.service, 600);
  await firstEntered;
  const second = f.refund(a.service, 600);
  const settled = Promise.allSettled([first, second]);
  // The first approval remains pending while the competing request reaches
  // validation. A safe implementation either waits or rejects that request.
  await delay(100);
  release();
  const outcomes = await settled;
  assert.equal(outcomes.filter((r) => r.status === "fulfilled" && r.value.statusCode === 200).length, 1);
  assert.equal(a.calls(), 1, "captured funds must be reserved before calling the acquirer");
  const state = await pool.query(`SELECT refunded_fils::text FROM transactions WHERE id = $1`, [f.transactionId]);
  assert.equal(state.rows[0]!.refunded_fils, "600");
  const refunds = await pool.query(`SELECT COALESCE(SUM(amount_fils), 0)::text AS total FROM refunds WHERE transaction_id = $1 AND status = 'succeeded'`, [f.transactionId]);
  assert.equal(refunds.rows[0]!.total, "600");
});

test("partial refunds conserve the historical net fee including discount debits", async () => {
  const f = await fixture(6, 6);
  await pool.query(
    `INSERT INTO ledger_entries (entry_group_id, merchant_id, transaction_id, account_id, direction, amount_fils, description, occurred_at)
     VALUES ($1, $2, $3, 'merchant_payable', 'debit', 3, 'capture fee', now()),
            ($1, $2, $3, 'platform_fee_revenue', 'credit', 3, 'capture fee', now()),
            ($1, $2, $3, 'platform_fee_revenue', 'debit', 1, 'capture discount', now()),
            ($1, $2, $3, 'merchant_payable', 'credit', 1, 'capture discount', now())`,
    [randomUUID(), f.merchantId, f.transactionId],
  );
  const a = acquirer();
  for (const amount of [2, 2, 2]) assert.equal((await f.refund(a.service, amount)).statusCode, 200);
  const result = await pool.query(
    `SELECT SUM(fee_reversed_fils)::text AS fee, SUM(amount_fils)::text AS amount FROM refunds WHERE transaction_id = $1`,
    [f.transactionId],
  );
  assert.deepEqual(result.rows[0], { fee: "2", amount: "6" });
  const net = await pool.query(
    `SELECT SUM(CASE WHEN direction = 'credit' THEN amount_fils ELSE -amount_fils END)::text AS fee
       FROM ledger_entries WHERE transaction_id = $1 AND account_id = 'platform_fee_revenue'`,
    [f.transactionId],
  );
  assert.equal(net.rows[0]!.fee, "0", "a full refund reverses precisely the fee actually charged");
});
