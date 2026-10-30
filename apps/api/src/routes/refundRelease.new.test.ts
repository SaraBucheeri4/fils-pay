/** FP-300: the export, reports, opt-in and dashboard capability around refunds. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../adminAuth/passwords.js";
import { issueApiKey } from "../apiKeys/issue.js";
import { hashPassword as hashMerchantPassword } from "../auth/passwords.js";
import { recordKycReview } from "../onboarding/review.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("refundRelease.new.test.ts requires DATABASE_URL");

const env = {
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  ACQUIRER_FAILURE_RATE: "0",
  ACQUIRER_LATENCY_MIN_MS: "0",
  ACQUIRER_LATENCY_MAX_MS: "1",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
};
const config = loadConfig({ ...env, FEATURE_REFUNDS: "true" });
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);
const flagOff = buildApp(loadConfig(env), pool);
test.after(async () => {
  await app.close();
  await flagOff.close();
  await pool.end();
});

const CARD = { pan: "4242424242424242", expiryMonth: 12, expiryYear: 2030, cvv: "123" };
const PASSWORD = "refund-release-test-password-9000!";

async function merchantFixture(refundsEnabled: boolean | null = true) {
  const m = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps, refunds_enabled) VALUES ($1, 250, $2) RETURNING id`,
    [`Refund Release ${randomUUID()}`, refundsEnabled],
  );
  const merchantId = m.rows[0]!.id;
  const email = `${randomUUID()}@example.test`;
  const u = await pool.query<{ id: string }>(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', $3) RETURNING id`,
    [merchantId, email, await hashMerchantPassword(PASSWORD, config)],
  );
  await recordKycReview(pool, { merchantId, outcome: "approved", reviewerIdentifier: "test" });
  const { rawKey } = await issueApiKey(pool, config, { merchantId, createdBy: u.rows[0]!.id, label: "t" });
  return { merchantId, email, rawKey, bearer: { authorization: `Bearer ${rawKey}` } };
}
type Merchant = Awaited<ReturnType<typeof merchantFixture>>;

async function capture(m: Merchant, amountFils: number): Promise<string> {
  const a = await app.inject({ method: "POST", url: "/v1/transactions", headers: { ...m.bearer, "idempotency-key": randomUUID() }, payload: { amountFils, card: CARD, reference: "r" } });
  assert.equal(a.statusCode, 201, a.body);
  const id = a.json().id as string;
  const c = await app.inject({ method: "POST", url: `/v1/transactions/${id}/capture`, headers: { ...m.bearer, "idempotency-key": randomUUID() }, payload: {} });
  assert.equal(c.statusCode, 200, c.body);
  return id;
}

const refund = (m: Merchant, transactionId: string, amountFils: number) =>
  app.inject({ method: "POST", url: "/v1/refunds", headers: { ...m.bearer, "idempotency-key": randomUUID() }, payload: { transactionId, amountFils } });

async function admin(role: "support" | "finance" | "super_admin"): Promise<{ id: string; cookie: string }> {
  const email = `${randomUUID()}@admin.test`;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, await hashPassword(PASSWORD, config), `Test ${role}`, role],
  );
  const login = await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email, password: PASSWORD } });
  assert.equal(login.statusCode, 200, login.body);
  const header = ([] as string[]).concat(login.headers["set-cookie"] as string | string[]).find((h) => h.startsWith(`${config.adminCookieName}=`))!;
  const cookie = header.split(";")[0]!;
  const verify = await app.inject({ method: "POST", url: "/v1/admin/auth/otp/verify", headers: { cookie }, payload: { code: login.json().devOtpCode } });
  assert.equal(verify.statusCode, 200, verify.body);
  return { id: inserted.rows[0]!.id, cookie };
}

async function merchantSessionCookie(m: Merchant, target = app): Promise<string> {
  const login = await target.inject({ method: "POST", url: "/v1/auth/login", payload: { merchantId: m.merchantId, email: m.email, password: PASSWORD } });
  assert.equal(login.statusCode, 200, login.body);
  const header = ([] as string[]).concat(login.headers["set-cookie"] as string | string[]).find((h) => h.startsWith(`${config.cookieName}=`))!;
  const cookie = header.split(";")[0]!;
  const verify = await target.inject({ method: "POST", url: "/v1/auth/otp/verify", headers: { cookie }, payload: { code: login.json().devOtpCode } });
  assert.equal(verify.statusCode, 200, verify.body);
  return cookie;
}

test("the CSV route delivers its rows, including the refunded amount", async () => {
  const m = await merchantFixture();
  const txn = await capture(m, 4759);
  assert.equal((await refund(m, txn, 1001)).statusCode, 200);
  const res = await app.inject({ method: "GET", url: "/v1/transactions/export", headers: m.bearer });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-type"]), /text\/csv/);
  const lines = res.body.trim().split("\n");
  assert.equal(lines[0], "id,status,amount_bhd,captured_bhd,reference,occurred_at,refunded_bhd");
  assert.equal(lines.length, 2);
  assert.ok(lines[1]!.startsWith(`${txn},partially_refunded,4.759,4.759,r,`));
  assert.ok(lines[1]!.endsWith(",1.001"));
});

test("the CSV route pages past 1000 rows sharing one timestamp without loss (B36, B38)", async () => {
  const m = await merchantFixture();
  await pool.query(
    `INSERT INTO transactions (merchant_id, amount_fils, status, acquirer_reference, occurred_at)
     SELECT $1, 1000, 'authorized', 'acq-' || g, '2026-09-01T10:00:00.123456Z' FROM generate_series(1, 2600) g`,
    [m.merchantId],
  );
  const res = await app.inject({ method: "GET", url: "/v1/transactions/export", headers: m.bearer });
  const ids = res.body.trim().split("\n").slice(1).map((line) => line.split(",")[0]);
  assert.equal(ids.length, 2600);
  assert.equal(new Set(ids).size, 2600);
});

test("the transactions report and settlement summary show refunds", async () => {
  const m = await merchantFixture();
  const txn = await capture(m, 4759);
  await refund(m, txn, 1001);
  const report = await app.inject({ method: "GET", url: "/v1/reporting/transactions", headers: m.bearer });
  const row = (report.json() as Array<{ id: string; refundedBhd: string }>).find((r) => r.id === txn)!;
  assert.equal(row.refundedBhd, "1.001");

  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 27 * 3600_000).toISOString().slice(0, 10);
  const summary = await app.inject({ method: "GET", url: `/v1/settlement/summary?from=${today}&to=${tomorrow}`, headers: m.bearer });
  assert.equal(summary.json().totalCapturedFils, 4759);
  assert.equal(summary.json().totalRefundedFils, 1001);
});

test("the volumes report exposes the refund rollup, including a refund-only day", async () => {
  const m = await merchantFixture();
  await pool.query(
    `INSERT INTO merchant_daily_volume (merchant_id, volume_date, refund_count, refund_gross_fils) VALUES ($1, '2026-09-02', 2, 4759)`,
    [m.merchantId],
  );
  const res = await app.inject({ method: "GET", url: "/v1/analytics/volumes?from=2026-09-01&to=2026-09-03", headers: m.bearer });
  assert.equal(res.statusCode, 200, res.body);
  const point = res.json().points[0];
  assert.deepEqual([point.date, point.refundCount, point.refundGrossFils], ["2026-09-02", 2, 4759]);
});

test("only finance and super admins can opt a merchant in, and each change is audited (ADR-0015)", async () => {
  const m = await merchantFixture(null);
  const url = `/v1/admin/merchants/${m.merchantId}/refunds-enabled`;
  const support = await admin("support");
  const finance = await admin("finance");

  assert.equal((await app.inject({ method: "POST", url, payload: { enabled: true } })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url, headers: { cookie: support.cookie }, payload: { enabled: true } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url, headers: { cookie: finance.cookie }, payload: { enabled: "yes" } })).statusCode, 400);
  const missing = `/v1/admin/merchants/${randomUUID()}/refunds-enabled`;
  assert.equal((await app.inject({ method: "POST", url: missing, headers: { cookie: finance.cookie }, payload: { enabled: true } })).statusCode, 404);

  const txn = await capture(m, 1000);
  assert.equal((await refund(m, txn, 100)).statusCode, 403, "NULL denies until someone opts in");

  const on = await app.inject({ method: "POST", url, headers: { cookie: finance.cookie }, payload: { enabled: true } });
  assert.deepEqual(on.json(), { merchantId: m.merchantId, refundsEnabled: true });
  assert.equal((await refund(m, txn, 100)).statusCode, 200);

  await app.inject({ method: "POST", url, headers: { cookie: finance.cookie }, payload: { enabled: false } });
  assert.equal((await refund(m, txn, 100)).statusCode, 403);

  const audit = await pool.query<{ metadata: { before: boolean | null; after: boolean } }>(
    `SELECT metadata FROM admin_audit_log WHERE admin_user_id = $1 AND action = 'merchant_refunds_enabled_change' AND target_id = $2 ORDER BY created_at`,
    [finance.id, m.merchantId],
  );
  assert.deepEqual(audit.rows.map((r) => [r.metadata.before, r.metadata.after]), [[null, true], [true, false]]);

  const detail = await app.inject({ method: "GET", url: `/v1/admin/merchants/${m.merchantId}`, headers: { cookie: finance.cookie } });
  assert.equal(detail.json().merchant.refundsEnabled, false);
});

test("the dashboard is told refunds are available only with both the flag and the opt-in", async () => {
  const enabled = await merchantFixture(true);
  const me = (cookie: string, target = app) => target.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } });
  assert.equal((await me(await merchantSessionCookie(enabled))).json().merchant.refundsAvailable, true);
  assert.equal((await me(await merchantSessionCookie(enabled, flagOff), flagOff)).json().merchant.refundsAvailable, false);

  const notEnabled = await merchantFixture(null);
  assert.equal((await me(await merchantSessionCookie(notEnabled))).json().merchant.refundsAvailable, false);
});

test("a support merchant user cannot refund through a session", async () => {
  const m = await merchantFixture();
  const txn = await capture(m, 1000);
  const email = `${randomUUID()}@example.test`;
  await pool.query(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'support', $3)`,
    [m.merchantId, email, await hashMerchantPassword(PASSWORD, config)],
  );
  const cookie = await merchantSessionCookie({ ...m, email });
  const res = await app.inject({ method: "POST", url: "/v1/refunds", headers: { cookie, "idempotency-key": randomUUID() }, payload: { transactionId: txn } });
  assert.equal(res.statusCode, 403, res.body);
});
