/**
 * B58: a refund reason is mandatory. A missing or blank reason is a 400
 * before any idempotency claim, acquirer call or refund row; a refund with
 * a reason succeeds and stores it. Requires DATABASE_URL to point at a
 * real, migrated Postgres.
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
import type { AcquirerRefundResult, AcquirerSimulator } from "../acquirer/types.js";
import { processRefund } from "./processRefund.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("refundReason.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
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

async function capturedTransactionForNewMerchant() {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Refund Reason Merchant ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  const owner = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash)
     VALUES ($1, $2, 'owner', 'unused-in-these-tests') RETURNING id`,
    [merchantId, `owner-${randomUUID()}@example.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const issued = await issueApiKey(pool, config, { merchantId, createdBy: owner.rows[0]!.id, label: "refund-reason" });

  const auth = { authorization: `Bearer ${issued.rawKey}` };
  const authorizeRes = await app.inject({
    method: "POST",
    url: "/v1/transactions",
    headers: { ...auth, "idempotency-key": randomUUID() },
    payload: { amountFils: 5_000, card: VALID_CARD, reference: "refund-reason-test" },
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

  return { merchantId, transactionId, actor: { type: "merchant_api_key" as const, id: issued.id } };
}

async function refundRows(transactionId: string) {
  const result = await pool.query<{ reason: string }>(`SELECT reason FROM refunds WHERE transaction_id = $1`, [
    transactionId,
  ]);
  return result.rows;
}

for (const [label, reason] of [
  ["missing", undefined],
  ["empty", ""],
  ["whitespace-only", "   "],
] as const) {
  test(`a ${label} refund reason is a 400 and nothing is refunded`, async () => {
    const { merchantId, transactionId, actor } = await capturedTransactionForNewMerchant();
    const acquirer = countingAcquirer();

    const result = await processRefund(pool, acquirer, {
      transactionId,
      merchantId,
      amountFils: toFils(1_000),
      idempotencyKey: randomUUID(),
      actor,
      ...(reason === undefined ? {} : { reason }),
    });

    assert.equal(result.statusCode, 400, JSON.stringify(result.body));
    assert.deepEqual(result.body, { error: "refund_reason_required" });
    assert.equal(acquirer.refundCalls, 0, "the acquirer must not be asked to refund");
    assert.equal((await refundRows(transactionId)).length, 0);
  });
}

test("a refund with a reason succeeds and stores the reason", async () => {
  const { merchantId, transactionId, actor } = await capturedTransactionForNewMerchant();
  const acquirer = countingAcquirer();

  const result = await processRefund(pool, acquirer, {
    transactionId,
    merchantId,
    amountFils: toFils(1_000),
    idempotencyKey: randomUUID(),
    actor,
    reason: "customer returned item",
  });

  assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  assert.equal(acquirer.refundCalls, 1);
  assert.deepEqual(await refundRows(transactionId), [{ reason: "customer returned item" }]);
});

test("a padded reason is stored trimmed", async () => {
  const { merchantId, transactionId, actor } = await capturedTransactionForNewMerchant();

  const result = await processRefund(pool, countingAcquirer(), {
    transactionId,
    merchantId,
    amountFils: toFils(1_000),
    idempotencyKey: randomUUID(),
    actor,
    reason: "  item damaged  ",
  });

  assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  assert.deepEqual(await refundRows(transactionId), [{ reason: "item damaged" }]);
});
