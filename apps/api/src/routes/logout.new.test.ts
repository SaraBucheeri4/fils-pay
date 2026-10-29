/**
 * Logout must revoke both a fully authenticated session and a pending
 * (pre-OTP) one: since B32, requireSession accepts only the former, so a
 * user who abandoned login on the OTP screen could not log out. Requires
 * DATABASE_URL to point at a real, migrated Postgres.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../auth/passwords.js";
import { sha256Hex } from "../lib/crypto.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("logout.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
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
  const email = `logout-${randomUUID()}@example.test`;
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Logout Merchant ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  await pool.query(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', $3)`,
    [merchantId, email, await hashPassword(PASSWORD, config)],
  );
  return { merchantId, email };
}

async function passwordStep(merchantId: string, email: string) {
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { merchantId, email, password: PASSWORD },
  });
  assert.equal(login.statusCode, 200, login.body);
  const setCookie = login.headers["set-cookie"];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, "login must set a session cookie");
  return { cookie: header.split(";")[0]!, otp: login.json<{ devOtpCode: string }>().devOtpCode };
}

async function sessionRevoked(cookie: string): Promise<boolean> {
  const tokenHash = sha256Hex(cookie.slice(cookie.indexOf("=") + 1));
  const row = await pool.query<{ revoked_at: Date | null }>(`SELECT revoked_at FROM sessions WHERE token_hash = $1`, [
    tokenHash,
  ]);
  assert.equal(row.rowCount, 1, "expected exactly one session row for the cookie");
  return row.rows[0]!.revoked_at !== null;
}

test("a pending (pre-OTP) session can log out, and its OTP can no longer be used", async () => {
  const { merchantId, email } = await createOwner();
  const { cookie, otp } = await passwordStep(merchantId, email);

  const logout = await app.inject({ method: "POST", url: "/v1/auth/logout", headers: { cookie } });
  assert.equal(logout.statusCode, 204, logout.body);
  assert.equal(await sessionRevoked(cookie), true);

  const verify = await app.inject({
    method: "POST",
    url: "/v1/auth/otp/verify",
    headers: { cookie },
    payload: { code: otp },
  });
  assert.notEqual(verify.statusCode, 200, "a revoked pending session must not complete OTP");
});

test("a fully authenticated session still logs out", async () => {
  const { merchantId, email } = await createOwner();
  const { cookie, otp } = await passwordStep(merchantId, email);
  const verify = await app.inject({
    method: "POST",
    url: "/v1/auth/otp/verify",
    headers: { cookie },
    payload: { code: otp },
  });
  assert.equal(verify.statusCode, 200, verify.body);

  const logout = await app.inject({ method: "POST", url: "/v1/auth/logout", headers: { cookie } });
  assert.equal(logout.statusCode, 204, logout.body);
  assert.equal(await sessionRevoked(cookie), true);
  assert.equal((await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } })).statusCode, 401);
});

test("logout without a valid session cookie is 401", async () => {
  assert.equal((await app.inject({ method: "POST", url: "/v1/auth/logout" })).statusCode, 401);
  const bogus = await app.inject({
    method: "POST",
    url: "/v1/auth/logout",
    headers: { cookie: `${config.cookieName}=not-a-real-token` },
  });
  assert.equal(bogus.statusCode, 401);
});
