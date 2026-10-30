import assert from "node:assert/strict";
import type {} from "../apps/api/src/fastify-instance.js";
import { createHmac, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Pool } from "pg";
import sharp from "sharp";
import { buildApp } from "../apps/api/src/app.js";
import { loadConfig } from "../apps/api/src/config.js";
import { withTransaction } from "../apps/api/src/db/withTransaction.js";
import { createAdminInvite, redeemAdminInvite } from "../apps/api/src/admin/inviteCode.js";
import { bulkApproveMerchantsKyc } from "../apps/api/src/admin/bulkKyc.js";
import { reconcileSandboxFlag } from "../apps/api/src/admin/merchantFlags.js";
import { startImpersonation } from "../apps/api/src/admin/impersonation.js";
import { createSavedFilter } from "../apps/api/src/reporting/savedFilters.js";
import { createWebhookEndpoint } from "../apps/api/src/webhooks/create.js";
import { runDispatchPass } from "../apps/api/src/webhooks/dispatcher.js";
import { createWebhookDeliveryArchive, replayWebhookDeliveryArchive } from "../apps/api/src/webhooks/archiveReplay.js";
import { deleteWebhookEndpoint } from "../apps/api/src/webhooks/cancel.js";
import { generateKycThumbnail } from "../apps/api/src/onboarding/kycThumbnail.js";
import { runConsumerPass } from "../apps/reporting/src/consumer/runConsumerPass.js";
import { applyEvent } from "../apps/reporting/src/consumer/applyEvent.js";
import { applyAcquirerCallback } from "../apps/api/src/acquirer/callbacks.js";
import { refreshAnalyticsRollups } from "../apps/api/src/admin/reportingRebuild.js";
import { assertDisposableSeedTarget } from "../db/seed/safety.js";

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("SECURITY_TEST_DATABASE_URL must identify a migrated disposable database");
assertDisposableSeedTarget(databaseUrl, { NODE_ENV: "test", ALLOW_DESTRUCTIVE_SEED: new URL(databaseUrl).pathname.slice(1) });
const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const replica = new Pool({ connectionString: databaseUrl, max: 4 });
const config = loadConfig({ DATABASE_URL: databaseUrl, NODE_ENV: "test", WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") });
after(async () => { await Promise.all([pool.end(), replica.end()]); });
async function merchant(status = "under_review") {
  return (await pool.query(`INSERT INTO merchants (display_name, mdr_bps, onboarding_status, test_mode) VALUES ('security test', 250, $1, true) RETURNING id`, [status])).rows[0].id as string;
}
async function admin(role = "finance") {
  return (await pool.query(`INSERT INTO admin_users (email, password_hash, display_name, role) VALUES ($1, 'unused', 'security tester', $2) RETURNING id`, [`${randomUUID()}@test.invalid`, role])).rows[0].id as string;
}
async function event(merchantId: string, eventType: string, payload: Record<string, unknown>, client = pool) {
  return (await client.query(`INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload) VALUES ($1, 'transaction', $2, $3) RETURNING id`, [eventType, randomUUID(), JSON.stringify({ merchantId, ...payload })])).rows[0].id as string;
}

test("admin invitations persist and redeem once under concurrency", async () => {
  const invite = await createAdminInvite(pool, { createdByAdminId: await admin(), email: "invite@test.invalid", role: "support", ttlHours: 1 });
  const results = await Promise.allSettled([pool, replica].map((db) => redeemAdminInvite(db, { code: invite.code, email: "invite@test.invalid" })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});

test("bulk KYC rejects invalid selection atomically and records individual reviews/audits", async () => {
  const reviewer = await admin();
  const valid = await merchant();
  const invalid = await merchant("submitted");
  await assert.rejects(bulkApproveMerchantsKyc(pool, { adminUserId: reviewer, merchantIds: [valid, invalid] }));
  assert.equal((await pool.query(`SELECT COUNT(*) FROM merchant_kyc_reviews WHERE merchant_id = $1`, [valid])).rows[0].count, "0");
  await bulkApproveMerchantsKyc(pool, { adminUserId: reviewer, merchantIds: [valid], notes: "reviewed" });
  assert.equal((await pool.query(`SELECT COUNT(*) FROM merchant_kyc_reviews WHERE merchant_id = $1 AND reviewer_admin_user_id = $2`, [valid, reviewer])).rows[0].count, "1");
  assert.equal((await pool.query(`SELECT COUNT(*) FROM admin_audit_log WHERE target_id = $1 AND action = 'kyc_review'`, [valid])).rows[0].count, "1");
  await withTransaction(pool, async (client) => {
    assert.deepEqual(await reconcileSandboxFlag(client, valid, { scanned: 5, openAuthorizations: 0 }), []);
  });
  assert.equal((await pool.query(`SELECT test_mode FROM merchants WHERE id = $1`, [valid])).rows[0].test_mode, true);
});

test("all admin roles impersonate as read-only support and exports authenticate", async () => {
  const merchantId = await merchant();
  const app = buildApp(config, pool);
  try {
    assert.equal((await app.inject({ url: "/v1/reporting/export-summary" })).statusCode, 401);
    for (const role of ["support", "finance", "super_admin"]) {
      const grant = await startImpersonation(pool, { adminUserId: await admin(role), merchantId, ttlMinutes: 5 });
      const headers = { cookie: `${config.impersonationCookieName}=${grant.rawToken}` };
      assert.equal((await app.inject({ url: "/v1/reporting/export-summary", headers })).statusCode, 200);
      assert.equal((await app.inject({ method: "POST", url: "/v1/reporting/saved-filters", headers, payload: { name: "blocked", filter: {} } })).statusCode, 403);
      await pool.query(`UPDATE admin_impersonation_grants SET expires_at = now() - interval '1 second' WHERE id = $1`, [grant.grantId]);
      assert.equal((await app.inject({ url: "/v1/reporting/export-summary", headers })).statusCode, 401);
    }
  } finally { await app.close(); }
});

test("saved filter quota serializes competing inserts at the fiftieth filter", async () => {
  const merchantId = await merchant();
  for (let i = 0; i < 49; i++) await createSavedFilter(pool, { merchantId, name: `filter ${i}`, filter: {} });
  const results = await Promise.allSettled([pool, replica].map((db) => createSavedFilter(db, { merchantId, name: randomUUID(), filter: {} })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await pool.query(`SELECT COUNT(*) FROM reporting_saved_filters WHERE merchant_id = $1`, [merchantId])).rows[0].count, "50");
});

test("late-committing outbox events survive a higher watermark and concurrent consumers", async () => {
  const merchantId = await merchant();
  const producer = await pool.connect();
  try {
    await producer.query("BEGIN");
    await producer.query(`INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload) VALUES ('transaction.captured', 'transaction', $1, $2)`, [randomUUID(), JSON.stringify({ merchantId, amountCapturedFils: 100 })]);
    await event(merchantId, "transaction.captured", { amountCapturedFils: 200 });
    await runConsumerPass(pool, { consumerBatchLimit: 500 });
    await producer.query("COMMIT");
    await Promise.all([pool, replica].map((db) => runConsumerPass(db, { consumerBatchLimit: 500 })));
    const total = await pool.query(`SELECT SUM(captured_count)::text AS count, SUM(captured_gross_fils)::text AS gross FROM merchant_daily_volume WHERE merchant_id = $1`, [merchantId]);
    assert.deepEqual(total.rows[0], { count: "2", gross: "300" });
  } finally { producer.release(); }
});

test("refund delivery signs sent bytes, claims once, retains disabled endpoint history, and reports Bahrain dates", async () => {
  const merchantId = await merchant();
  const adminUserId = await admin();
  const endpoint = await createWebhookEndpoint(pool, config, { merchantId, url: "https://example.com/hook", createdByType: "merchant_session", createdById: randomUUID() });
  const id = await event(merchantId, "refund.succeeded", { refundId: randomUUID(), amountFils: 300, feeReversedFils: 5, refundedTotalFils: 300, newStatus: "refunded" });
  // Bahrain day differs from UTC day; preserve the absolute stored instant.
  await pool.query(`UPDATE outbox_events SET created_at = '2026-03-31T21:30:00Z' WHERE id = $1`, [id]);
  await pool.query(`UPDATE webhook_endpoints SET created_at = '2026-01-01' WHERE id = $1`, [endpoint.id]);
  let count = 0;
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const send = async (request: { headers: Record<string, string>; body: string }) => {
    count++;
    const header = request.headers["Webhook-Signature"] ?? request.headers["webhook-signature"]!;
    const timestamp = header.match(/t=(\d+)/)![1];
    const digest = createHmac("sha256", endpoint.secret).update(`${timestamp}.${request.body}`).digest("hex");
    assert.equal(header, `t=${timestamp},v1=${digest}`);
    assert.equal(JSON.parse(request.body).data.amountFils, 300);
    enter();
    await gate;
    return { statusCode: 200, body: "ok" };
  };
  const first = runDispatchPass(pool, send, config);
  await entered;
  try { await runDispatchPass(replica, send, config); assert.equal(count, 1); }
  finally { release(); }
  await first;
  await runConsumerPass(pool, { consumerBatchLimit: 500 });
  assert.equal((await pool.query(`SELECT refund_gross_fils::text AS gross FROM merchant_daily_volume WHERE merchant_id = $1 AND volume_date = '2026-04-01'`, [merchantId])).rows[0].gross, "300");
  const archive = await createWebhookDeliveryArchive(pool, { merchantId, endpointId: endpoint.id, adminUserId, from: new Date("2020-01-01"), to: new Date("2030-01-01") });
  await deleteWebhookEndpoint(pool, { merchantId, id: endpoint.id });
  assert.equal((await pool.query(`SELECT status FROM webhook_endpoints WHERE id = $1`, [endpoint.id])).rows[0].status, "disabled");
  assert.equal((await pool.query(`SELECT COUNT(*) FROM webhook_deliveries WHERE endpoint_id = $1`, [endpoint.id])).rows[0].count, "1");
  assert.equal((await pool.query(`SELECT COUNT(*) FROM webhook_delivery_archives WHERE id = $1`, [archive.archiveId])).rows[0].count, "1");
  await assert.rejects(replayWebhookDeliveryArchive(pool, { merchantId, archiveId: archive.archiveId, targetEndpointId: endpoint.id, adminUserId }));
});

test("source rebuild and live consumption commit receipts with the snapshot", async () => {
  const merchantId = await merchant();
  const txn = (await pool.query(`INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference) VALUES ($1, 'captured', 1000, 1000, 'rebuild-fixture') RETURNING id`, [merchantId])).rows[0].id as string;
  await withTransaction(pool, async (client) => {
    await client.query(`INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type) VALUES ($1, 'captured', 1000, 'system')`, [txn]);
    await client.query(`INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload) VALUES ('transaction.captured', 'transaction', $1, $2)`, [txn, JSON.stringify({ merchantId, amountCapturedFils: 1000 })]);
  });
  await Promise.all([withTransaction(pool, refreshAnalyticsRollups), runConsumerPass(replica, { consumerBatchLimit: 500 })]);
  const results = await Promise.all([pool, replica].map((db) => runConsumerPass(db, { consumerBatchLimit: 500 })));
  assert.deepEqual(results, [{ processedCount: 0 }, { processedCount: 0 }]);
  assert.equal((await pool.query(`SELECT SUM(captured_gross_fils)::text AS gross FROM merchant_daily_volume WHERE merchant_id = $1`, [merchantId])).rows[0].gross, "1000");
});

test("oversized decoded image and accidental destructive seed targets are rejected", async () => {
  const image = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(generateKycThumbnail(image, "png"));
  assert.throws(() => assertDisposableSeedTarget("postgres://localhost/filspay", { ALLOW_DESTRUCTIVE_SEED: "filspay" }));
  assert.throws(() => assertDisposableSeedTarget("postgres://remote.example/security_test", { ALLOW_DESTRUCTIVE_SEED: "security_test" }));
});

test("callbacks deduplicate across independent pools and missing rollups do not poison batch-close or paid lifecycle", async () => {
  const merchantId = await merchant();
  const txn = (await pool.query(`INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference) VALUES ($1, 'captured', 1000, 1000, 'security-fixture') RETURNING id`, [merchantId])).rows[0].id as string;
  const callback = { callbackId: randomUUID(), type: "fraud_review.completed" as const, transactionId: txn, occurredAt: new Date().toISOString(), outcome: "cleared" as const, note: "review" };
  await Promise.all([pool, replica].map((db) => applyAcquirerCallback(db, callback)));
  assert.equal((await pool.query(`SELECT COUNT(*) FROM acquirer_callback_notes WHERE callback_id = $1`, [callback.callbackId])).rows[0].count, "1");
  const secret = "security-route-callback";
  const app = buildApp({ ...config, acquirerCallbackSigningSecret: secret }, pool);
  try {
    const signedHeaders = (body: unknown, offset = 0) => {
      const timestamp = Math.floor(Date.now() / 1000) + offset;
      const digest = createHmac("sha256", secret).update(`${timestamp}.${JSON.stringify(body)}`).digest("hex");
      return { "acquirer-callback-signature": `t=${timestamp},v1=${digest}` };
    };
    assert.equal((await app.inject({ method: "POST", url: "/v1/acquirer/callbacks", headers: signedHeaders(callback), payload: callback })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: "/v1/acquirer/callbacks", payload: callback })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/v1/acquirer/callbacks", headers: signedHeaders(callback, -301), payload: callback })).statusCode, 401);
    const unknown = { ...callback, transactionId: randomUUID(), callbackId: randomUUID() };
    assert.equal((await app.inject({ method: "POST", url: "/v1/acquirer/callbacks", headers: signedHeaders(unknown), payload: unknown })).statusCode, 404);
  } finally { await app.close(); }
  await pool.query(`INSERT INTO transaction_events (transaction_id, event_type, amount_fils, actor_type, occurred_at) VALUES ($1, 'captured', 1000, 'system', '2026-04-01T00:00:00+03:00')`, [txn]);
  const batchId = (await pool.query(`INSERT INTO settlement_batches (merchant_id, batch_date, status, gross_fils, fee_fils, net_payout_fils) VALUES ($1, '2026-04-01', 'closed', 1000, 25, 975) RETURNING id`, [merchantId])).rows[0].id as string;
  await withTransaction(pool, (client) => applyEvent(client, {
    id: "0", event_type: "settlement.batch_closed", aggregate_id: batchId, created_at: new Date(),
    payload: { merchantId, batchId, batchDate: "2026-04-01", grossFils: 1000, feeFils: 25, netPayoutFils: 975 },
  }));
  await pool.query(`UPDATE settlement_batches SET status = 'paid', paid_at = '2026-04-02T01:00:00+03:00' WHERE id = $1`, [batchId]);
  await event(merchantId, "settlement.paid", { batchId });
  await runConsumerPass(pool, { consumerBatchLimit: 500 });
  const trend = (await pool.query(`SELECT status, paid_at FROM merchant_payout_trends WHERE settlement_batch_id = $1`, [batchId])).rows[0];
  assert.equal(trend.status, "paid");
  assert.equal(trend.paid_at.toISOString(), "2026-04-01T22:00:00.000Z");
});

test("archive creation and legacy replay reject oversized payloads before Node materialization", async () => {
  const merchantId = await merchant();
  const adminUserId = await admin();
  const endpoint = await createWebhookEndpoint(pool, config, { merchantId, url: "https://example.com/hook", createdByType: "merchant_session", createdById: randomUUID() });
  const eventId = await event(merchantId, "transaction.voided", {});
  await pool.query(`INSERT INTO webhook_deliveries (endpoint_id, outbox_event_id, event_type, delivery_event_id, payload) VALUES ($1, $2, 'transaction.voided', $3, jsonb_build_object('large', repeat('x', 4194305)))`, [endpoint.id, eventId, randomUUID()]);
  await assert.rejects(createWebhookDeliveryArchive(pool, { merchantId, endpointId: endpoint.id, adminUserId, from: new Date("2020-01-01"), to: new Date("2030-01-01") }), /smaller archive date range/);
  const archive = await pool.query(`INSERT INTO webhook_delivery_archives (endpoint_id, merchant_id, created_by_admin_user_id, from_created_at, to_created_at, delivery_count, archive_payload) VALUES ($1, $2, $3, now(), now(), 1, repeat('x', 4194305)) RETURNING id`, [endpoint.id, merchantId, adminUserId]);
  await assert.rejects(replayWebhookDeliveryArchive(pool, { merchantId, archiveId: archive.rows[0].id, targetEndpointId: endpoint.id, adminUserId }), /bounded offline replay/);
});

test("an audit failure rolls back valid bulk KYC reviews and merchant state", async () => {
  const merchantId = await merchant();
  const reviewer = await admin();
  const failingPool = { connect: async () => {
    const real = await pool.connect();
    return {
      query: (sql: string, params?: unknown[]) => sql.includes("INSERT INTO admin_audit_log")
        ? Promise.reject(new Error("injected audit failure")) : real.query(sql, params),
      release: real.release.bind(real),
    };
  } } as unknown as Pool;
  await assert.rejects(bulkApproveMerchantsKyc(failingPool, { merchantIds: [merchantId], adminUserId: reviewer }), /injected audit failure/);
  assert.equal((await pool.query(`SELECT onboarding_status FROM merchants WHERE id = $1`, [merchantId])).rows[0].onboarding_status, "under_review");
  assert.equal((await pool.query(`SELECT COUNT(*) FROM merchant_kyc_reviews WHERE merchant_id = $1`, [merchantId])).rows[0].count, "0");
});

test("refund summary joins each refund to its transaction rather than the refund UUID", async () => {
  const merchantId = await merchant();
  const txn = (await pool.query(`INSERT INTO transactions (merchant_id, status, amount_fils, captured_fils, acquirer_reference) VALUES ($1, 'captured', 1000, 1000, 'summary-fixture') RETURNING id`, [merchantId])).rows[0].id as string;
  await pool.query(`INSERT INTO refunds (transaction_id, merchant_id, amount_fils, fee_reversed_fils, status, acquirer_reference, created_by_type, created_by_id, occurred_at)
    VALUES ($1, $2, 300, 5, 'succeeded', 'refund-summary-fixture', 'merchant_session', $3, '2026-03-31T21:30:00Z')`, [txn, merchantId, randomUUID()]);
  await pool.query(`REFRESH MATERIALIZED VIEW refund_merchant_summary`);
  const row = (await pool.query(`SELECT refund_count::text, total_refunded_fils::text, original_captured_fils::text, business_date::date::text FROM refund_merchant_summary WHERE merchant_id = $1`, [merchantId])).rows[0];
  assert.deepEqual(row, { refund_count: "1", total_refunded_fils: "300", original_captured_fils: "1000", business_date: "2026-04-01" });
});
