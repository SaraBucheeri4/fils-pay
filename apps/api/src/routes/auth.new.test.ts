/**
 * Merchant login must issue the session for the merchant the user asked to
 * log in to, even when the same email exists under several merchants
 * (B42). Requires DATABASE_URL to point at a real, migrated Postgres.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../auth/passwords.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("auth.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
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

async function createMerchantWithUser(email: string, role: "owner" | "support") {
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Auth Isolation Merchant ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  await pool.query(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, $3, $4)`,
    [merchantId, email, role, await hashPassword(PASSWORD, config)],
  );
  return merchantId;
}

function sessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, "login must set a session cookie");
  return header.split(";")[0]!;
}

async function loginAndVerify(merchantId: string, email: string) {
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { merchantId, email, password: PASSWORD },
  });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = sessionCookie(login.headers["set-cookie"]);
  const { devOtpCode } = login.json<{ devOtpCode: string }>();

  const verify = await app.inject({
    method: "POST",
    url: "/v1/auth/otp/verify",
    headers: { cookie },
    payload: { code: devOtpCode },
  });
  assert.equal(verify.statusCode, 200, verify.body);
  return verify.json<{ merchantId: string; role: string }>();
}

test("same email at two merchants: each login lands in the merchant that was asked for", async () => {
  const email = `shared-${randomUUID()}@example.test`;
  const merchantA = await createMerchantWithUser(email, "owner");
  const merchantB = await createMerchantWithUser(email, "support");

  const a = await loginAndVerify(merchantA, email);
  assert.equal(a.merchantId, merchantA);
  assert.equal(a.role, "owner");

  const b = await loginAndVerify(merchantB, email);
  assert.equal(b.merchantId, merchantB);
  assert.equal(b.role, "support");
});

test("a valid password for merchant A does not log in to merchant B", async () => {
  const email = `only-a-${randomUUID()}@example.test`;
  const merchantA = await createMerchantWithUser(email, "owner");
  const otherMerchant = await createMerchantWithUser(`someone-else-${randomUUID()}@example.test`, "owner");

  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { merchantId: otherMerchant, email, password: PASSWORD },
  });
  assert.equal(res.statusCode, 401);
  assert.ok(merchantA);
});
