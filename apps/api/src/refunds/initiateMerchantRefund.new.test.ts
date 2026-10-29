/**
 * B68: merchant A must not be able to refund merchant B's transaction by
 * passing B's transactionId under A's own (scope-checked) merchant. It must
 * be the same 404 as an unknown transaction, with no acquirer call and no
 * money movement. Requires DATABASE_URL to point at a real, migrated Postgres.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { toFils } from "@filspay/money";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { recordKycReview } from "../onboarding/review.js";
import { NotFoundError } from "../lib/errors.js";
import type { AcquirerRefundResult, AcquirerSimulator } from "../acquirer/types.js";
import { processRefund } from "../payments/processRefund.js";
import { initiateMerchantRefund } from "./initiateMerchantRefund.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("initiateMerchantRefund.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);

test.after(async () => {
  await app.close();
  await pool.end();
});

const VALID_CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };

/** Approves every refund and counts how often it was asked. */
function countingAcquirer(): AcquirerSimulator & { refundCalls: number } {
  const acquirer = {
    refundCalls: 0,
    authorize(): never {
      throw new Error("countingAcquirer: authorize is not used by these tests");
    },
    capture(): never {
      throw new Error("countingAcquirer: capture is not used by these tests");
    },
    refund(req: { acquirerReference: string }): Promise<AcquirerRefundResult> {
      acquirer.refundCalls += 1;
      return Promise.resolve({ outcome: "approved", acquirerReference: req.acquirerReference, latencyMs: 0 });
    },
  };
  return acquirer as unknown as AcquirerSimulator & { refundCalls: number };
}

async function createApprovedMerchant(label: string) {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Refund Isolation Merchant ${label} ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused-in-these-tests') RETURNING id`,
    [merchantId, `owner-${randomUUID()}@example.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const issued = await issueApiKey(pool, config, { merchantId, createdBy: owner.rows[0]!.id, label });
  return { merchantId, rawKey: issued.rawKey, actor: { type: "merchant_api_key" as const, id: issued.id } };
}

async function capturedTransaction(rawKey: string, amountFils: number): Promise<string> {
  const auth = { authorization: `Bearer ${rawKey}` };
  const authorizeRes = await app.inject({
    method: "POST",
    url: "/v1/transactions",
    headers: { ...auth, "idempotency-key": randomUUID() },
    payload: { amountFils, card: VALID_CARD, reference: "refund-isolation-test" },
  });
  assert.equal(authorizeRes.statusCode, 201, authorizeRes.body);
  const transactionId = authorizeRes.json<{ id: string }>().id;
  const captureRes = await app.inject({
    method: "POST",
    url: `/v1/transactions/${transactionId}/capture`,
    headers: { ...auth, "idempotency-key": randomUUID() },
    payload: {},
  });
  assert.equal(captureRes.statusCode, 200, captureRes.body);
  return transactionId;
}

async function refundState(transactionId: string) {
  const txn = await pool.query<{ refunded_fils: string; status: string }>(
    `SELECT refunded_fils::text, status FROM transactions WHERE id = $1`,
    [transactionId],
  );
  const refunds = await pool.query(`SELECT 1 FROM refunds WHERE transaction_id = $1`, [transactionId]);
  return { refundedFils: txn.rows[0]!.refunded_fils, status: txn.rows[0]!.status, refundRows: refunds.rowCount };
}

test("merchant A cannot refund merchant B's transaction", async () => {
  const a = await createApprovedMerchant("caller");
  const b = await createApprovedMerchant("victim");
  const victimTransaction = await capturedTransaction(b.rawKey, 10_000);
  const before = await refundState(victimTransaction);
  const acquirer = countingAcquirer();

  await assert.rejects(
    () =>
      initiateMerchantRefund(pool, acquirer, {
        merchantId: a.merchantId,
        transactionId: victimTransaction,
        amountFils: toFils(10_000),
        idempotencyKey: randomUUID(),
        actor: a.actor,
        reason: "cross-merchant attempt",
      }),
    NotFoundError,
  );

  assert.equal(acquirer.refundCalls, 0, "the acquirer must not be asked to refund another merchant's money");
  assert.deepEqual(await refundState(victimTransaction), before, "merchant B's transaction must be untouched");
});

test("processRefund itself refuses another merchant's transaction (defence in depth)", async () => {
  const a = await createApprovedMerchant("direct-caller");
  const b = await createApprovedMerchant("direct-victim");
  const victimTransaction = await capturedTransaction(b.rawKey, 10_000);
  const before = await refundState(victimTransaction);
  const acquirer = countingAcquirer();

  const result = await processRefund(pool, acquirer, {
    transactionId: victimTransaction,
    merchantId: a.merchantId,
    amountFils: toFils(10_000),
    idempotencyKey: randomUUID(),
    actor: a.actor,
    reason: "cross-merchant attempt",
  });

  assert.equal(result.statusCode, 404, JSON.stringify(result.body));
  assert.deepEqual(result.body, { error: "transaction_not_found" });
  assert.equal(acquirer.refundCalls, 0);
  assert.deepEqual(await refundState(victimTransaction), before, "merchant B's transaction must be untouched");
});

test("a merchant can still refund its own transaction", async () => {
  const a = await createApprovedMerchant("own");
  const ownTransaction = await capturedTransaction(a.rawKey, 10_000);
  const acquirer = countingAcquirer();

  const result = await initiateMerchantRefund(pool, acquirer, {
    merchantId: a.merchantId,
    transactionId: ownTransaction,
    amountFils: toFils(4_000),
    idempotencyKey: randomUUID(),
    actor: a.actor,
    reason: "partial return",
  });

  assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  assert.equal(acquirer.refundCalls, 1);
  assert.equal((await refundState(ownTransaction)).refundedFils, "4000");
});
