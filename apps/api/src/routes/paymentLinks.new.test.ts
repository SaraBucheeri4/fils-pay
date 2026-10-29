/**
 * B34: a merchant must not be able to cancel another merchant's payment
 * link by putting that link's id under its own merchant URL. Requires
 * DATABASE_URL to point at a real, migrated Postgres.
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
  throw new Error("paymentLinks.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
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

async function createMerchantWithOwner() {
  const email = `links-${randomUUID()}@example.test`;
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Payment Link Isolation Merchant ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  await pool.query(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', $3)`,
    [merchantId, email, await hashPassword(PASSWORD, config)],
  );
  return { merchantId, email };
}

/** Full password + OTP login; returns the authenticated session cookie. */
async function authenticatedCookie(merchantId: string, email: string): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { merchantId, email, password: PASSWORD },
  });
  assert.equal(login.statusCode, 200, login.body);
  const setCookie = login.headers["set-cookie"];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, "login must set a session cookie");
  const cookie = header.split(";")[0]!;
  const { devOtpCode } = login.json<{ devOtpCode: string }>();

  const verify = await app.inject({
    method: "POST",
    url: "/v1/auth/otp/verify",
    headers: { cookie },
    payload: { code: devOtpCode },
  });
  assert.equal(verify.statusCode, 200, verify.body);
  return cookie;
}

async function insertActiveLink(merchantId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO payment_links (merchant_id, token, amount_fils, expires_at, created_by_type, created_by_id)
     VALUES ($1, $2, 4750, now() + interval '1 day', 'merchant_session', $3)
     RETURNING id`,
    [merchantId, `test-${randomUUID()}`, randomUUID()],
  );
  return result.rows[0]!.id;
}

async function linkStatus(linkId: string): Promise<string> {
  const result = await pool.query<{ status: string }>(`SELECT status FROM payment_links WHERE id = $1`, [linkId]);
  return result.rows[0]!.status;
}

test("merchant A cannot cancel merchant B's payment link through A's own URL", async () => {
  const a = await createMerchantWithOwner();
  const b = await createMerchantWithOwner();
  const victimLink = await insertActiveLink(b.merchantId);
  const cookie = await authenticatedCookie(a.merchantId, a.email);

  const res = await app.inject({
    method: "DELETE",
    url: `/v1/merchants/${a.merchantId}/payment-links/${victimLink}`,
    headers: { cookie },
  });

  assert.equal(res.statusCode, 404, `expected not-found for an out-of-scope link, got ${res.statusCode}`);
  assert.equal(await linkStatus(victimLink), "active", "merchant B's link must not be canceled");
});

test("a merchant can still cancel its own payment link", async () => {
  const a = await createMerchantWithOwner();
  const ownLink = await insertActiveLink(a.merchantId);
  const cookie = await authenticatedCookie(a.merchantId, a.email);

  const res = await app.inject({
    method: "DELETE",
    url: `/v1/merchants/${a.merchantId}/payment-links/${ownLink}`,
    headers: { cookie },
  });

  assert.equal(res.statusCode, 204, res.body);
  assert.equal(await linkStatus(ownLink), "canceled");
});
