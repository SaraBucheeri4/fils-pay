/** ADR-0013: an unknown capture outcome blocks the link until it is resolved. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import type { AcquirerSimulator } from "../acquirer/types.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { recordKycReview } from "../onboarding/review.js";
import { listPaymentLinkCaptureReviews, resolvePaymentLinkCaptureReview } from "./captureReview.js";
import { payPaymentLink } from "./pay.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("captureReview.new.test.ts requires DATABASE_URL");

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
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

const CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };
const LINK_CONFIG = { paymentLinkReservationTimeoutSeconds: 60 };

/** Real simulator, except that capture answers `error` until `healthy` is set. */
function flakyAcquirer() {
  const state = { healthy: false, captureCalls: [] as string[] };
  const acquirer: AcquirerSimulator = {
    authorize: (req) => app.acquirer.authorize(req),
    refund: (req) => app.acquirer.refund(req),
    capture: (req) => {
      state.captureCalls.push(req.idempotencyKey);
      return state.healthy
        ? app.acquirer.capture(req)
        : Promise.resolve({ outcome: "error", acquirerReference: req.acquirerReference, latencyMs: 0 });
    },
  };
  return { acquirer, state };
}

async function linkFixture() {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Review Merchant ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  const user = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', 'x') RETURNING id`,
    [merchantId, `${randomUUID()}@example.test`],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const { rawKey } = await issueApiKey(pool, config, { merchantId, createdBy: user.rows[0]!.id, label: "t" });
  const res = await app.inject({
    method: "POST",
    url: `/v1/merchants/${merchantId}/payment-links`,
    headers: { authorization: `Bearer ${rawKey}` },
    payload: { amountFils: 1000, reference: "r", description: "d", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
  });
  assert.equal(res.statusCode, 201, res.body);
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (email, display_name, role, password_hash) VALUES ($1, 'Reviewer', 'finance', 'x') RETURNING id`,
    [`${randomUUID()}@example.test`],
  );
  return { merchantId, token: res.json().token as string, linkId: res.json().id as string, adminUserId: admin.rows[0]!.id };
}

const linkRow = async (id: string) =>
  (await pool.query<{ status: string; capture_attempt_at: Date | null; transaction_id: string | null }>(
    `SELECT status, capture_attempt_at, transaction_id FROM payment_links WHERE id = $1`, [id])).rows[0]!;
const ageAttempt = (id: string) =>
  pool.query(`UPDATE payment_links SET capture_attempt_at = now() - interval '2 minutes', reserved_at = now() - interval '2 minutes' WHERE id = $1`, [id]);
const pay = (acquirer: AcquirerSimulator, token: string) =>
  payPaymentLink(pool, acquirer, LINK_CONFIG, { token, card: CARD, idempotencyKey: randomUUID() });

test("an acquirer error on capture blocks every other buyer, even after the reservation times out", async () => {
  const f = await linkFixture();
  const { acquirer, state } = flakyAcquirer();

  assert.equal((await pay(acquirer, f.token)).statusCode, 502);
  assert.equal((await linkRow(f.linkId)).status, "reserved");
  await ageAttempt(f.linkId);

  const second = await pay(app.acquirer, f.token);
  assert.equal(second.statusCode, 409);
  assert.deepEqual(second.body, { error: "payment_link_processing" });
  assert.equal(state.captureCalls.length, 1);

  const read = await app.inject({ method: "GET", url: `/v1/payment-links/${f.token}` });
  assert.equal(read.json().status, "processing");
});

test("a capture still in flight is not listed for review", async () => {
  const f = await linkFixture();
  const { acquirer } = flakyAcquirer();
  await pay(acquirer, f.token);
  assert.deepEqual(await listPaymentLinkCaptureReviews(pool, f.merchantId, 60), []);
  await ageAttempt(f.linkId);
  assert.equal((await listPaymentLinkCaptureReviews(pool, f.merchantId, 60)).length, 1);
});

test("retry_capture reuses the same acquirer key and marks the link paid", async () => {
  const f = await linkFixture();
  const { acquirer, state } = flakyAcquirer();
  await pay(acquirer, f.token);
  await ageAttempt(f.linkId);

  state.healthy = true;
  const resolved = await resolvePaymentLinkCaptureReview(pool, acquirer, {
    merchantId: f.merchantId, linkId: f.linkId, adminUserId: f.adminUserId, resolution: "retry_capture", timeoutSeconds: 60,
  });
  assert.deepEqual(resolved, { status: "paid", outcome: "captured" });
  assert.equal(new Set(state.captureCalls).size, 1, "both calls must carry one idempotency key");
  const link = await linkRow(f.linkId);
  assert.equal(link.status, "paid");
  assert.equal(link.capture_attempt_at, null);
  assert.equal((await pay(app.acquirer, f.token)).statusCode, 409);
});

test("release voids the authorization, frees its hold and reopens the link, with an audit row", async () => {
  const f = await linkFixture();
  const { acquirer } = flakyAcquirer();
  await pay(acquirer, f.token);
  await ageAttempt(f.linkId);

  const resolved = await resolvePaymentLinkCaptureReview(pool, acquirer, {
    merchantId: f.merchantId, linkId: f.linkId, adminUserId: f.adminUserId, resolution: "release", timeoutSeconds: 60,
  });
  assert.deepEqual(resolved, { status: "active", outcome: "released" });

  const holds = await pool.query(
    `SELECT 1 FROM holds h JOIN transactions t ON t.id = h.transaction_id WHERE t.merchant_id = $1 AND h.status = 'active'`, [f.merchantId]);
  assert.equal(holds.rowCount, 0);
  const audit = await pool.query(
    `SELECT 1 FROM admin_audit_log WHERE admin_user_id = $1 AND action = 'payment_link_capture_review'`, [f.adminUserId]);
  assert.equal(audit.rowCount, 1);
  assert.equal((await pay(app.acquirer, f.token)).statusCode, 200);
});

test("a superseded attempt never reaches capture and leaves no live hold", async () => {
  const f = await linkFixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let captures = 0;
  const slow: AcquirerSimulator = {
    authorize: async (req) => { const out = await app.acquirer.authorize(req); await gate; return out; },
    capture: (req) => { captures++; return app.acquirer.capture(req); },
    refund: (req) => app.acquirer.refund(req),
  };
  const first = pay(slow, f.token);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await pool.query(`UPDATE payment_links SET reserved_at = now() - interval '2 minutes' WHERE id = $1`, [f.linkId]);
  assert.equal((await pay(app.acquirer, f.token)).statusCode, 200);
  release();
  assert.equal((await first).statusCode, 409);
  assert.equal(captures, 0);
  const holds = await pool.query(
    `SELECT 1 FROM holds h JOIN transactions t ON t.id = h.transaction_id WHERE t.merchant_id = $1 AND h.status = 'active'`, [f.merchantId]);
  assert.equal(holds.rowCount, 0);
});
