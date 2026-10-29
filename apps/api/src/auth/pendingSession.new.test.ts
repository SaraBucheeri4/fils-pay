/**
 * B32 / B62: a session that has passed the password step but not the OTP
 * must not reach protected merchant routes, and in particular must not be
 * able to issue an API key. Requires DATABASE_URL to point at a real,
 * migrated Postgres.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "./passwords.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("pendingSession.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const app = buildApp(config, pool);

test.after(async () => {
  await app.close();
  await pool.end();
});

const PASSWORD = "correct horse battery staple";

async function createOwner() {
  const email = `pending-${randomUUID()}@example.test`;
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Pending Session Merchant ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  await pool.query(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', $3)`,
    [merchantId, email, await hashPassword(PASSWORD, config)],
  );
  return { merchantId, email };
}

/** Password step only: returns the pending session cookie, OTP never verified. */
async function passwordOnlyCookie(merchantId: string, email: string): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { merchantId, email, password: PASSWORD },
  });
  assert.equal(login.statusCode, 200, login.body);
  const setCookie = login.headers["set-cookie"];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, "login must set a session cookie");
  return header.split(";")[0]!;
}

test("a pending (pre-OTP) session cannot read protected merchant data", async () => {
  const { merchantId, email } = await createOwner();
  const cookie = await passwordOnlyCookie(merchantId, email);

  const res = await app.inject({
    method: "GET",
    url: `/v1/merchants/${merchantId}/payment-links`,
    headers: { cookie },
  });
  assert.equal(res.statusCode, 401, `pending session got ${res.statusCode}: ${res.body}`);
});

test("the live_sessions view excludes pending (pre-OTP) sessions", async () => {
  const { merchantId, email } = await createOwner();
  await passwordOnlyCookie(merchantId, email);

  const result = await pool.query(
    `SELECT 1 FROM live_sessions ls
       JOIN merchant_users mu ON mu.id = ls.merchant_user_id
      WHERE mu.merchant_id = $1`,
    [merchantId],
  );
  assert.equal(result.rowCount, 0, "a session that never passed OTP must not appear in live_sessions");
});

test("a pending (pre-OTP) session cannot issue an API key", async () => {
  const { merchantId, email } = await createOwner();
  const cookie = await passwordOnlyCookie(merchantId, email);

  const res = await app.inject({
    method: "POST",
    url: `/v1/merchants/${merchantId}/api-keys`,
    headers: { cookie },
    payload: { label: "should not be issued" },
  });
  assert.equal(res.statusCode, 401, `pending session got ${res.statusCode}: ${res.body}`);

  const keys = await pool.query(`SELECT 1 FROM api_keys WHERE merchant_id = $1`, [merchantId]);
  assert.equal(keys.rowCount, 0, "no API key may exist for a merchant whose owner never passed OTP");
});
