/**
 * The test override codes. The route tests need a real, migrated Postgres and
 * skip without DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "./passwords.js";
import { matchesOtpOverride } from "./otp.js";

const OVERRIDE = "test-override-1234";
const ADMIN_OVERRIDE = "admin-override-5678";
const PASSWORD = "correct horse battery staple";
const base = { DATABASE_URL: "postgres://unused/unused", NODE_ENV: "test" };

test("matchesOtpOverride matches only the exact configured string", () => {
  assert.equal(matchesOtpOverride(OVERRIDE, OVERRIDE), true);
  assert.equal(matchesOtpOverride("test-override-123", OVERRIDE), false);
  assert.equal(matchesOtpOverride(OVERRIDE, undefined), false);
  assert.equal(matchesOtpOverride("", undefined), false);
  assert.equal(matchesOtpOverride(123456, "123456"), false);
});

test("loadConfig leaves the overrides unset by default and when empty", () => {
  assert.equal(loadConfig(base).otpOverrideCode, undefined);
  assert.equal(loadConfig({ ...base, OTP_OVERRIDE_CODE: "" }).otpOverrideCode, undefined);
  assert.equal(loadConfig({ ...base, ADMIN_OTP_OVERRIDE_CODE: "" }).adminOtpOverrideCode, undefined);
});

for (const name of ["OTP_OVERRIDE_CODE", "ADMIN_OTP_OVERRIDE_CODE"]) {
  test(`loadConfig refuses ${name} in production`, () => {
    assert.throws(
      () =>
        loadConfig({
          DATABASE_URL: "postgres://unused/unused",
          NODE_ENV: "production",
          SETTLEMENT_INTERNAL_TOKEN: "t",
          ACQUIRER_CALLBACK_SIGNING_SECRET: "s",
          WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
          [name]: OVERRIDE,
        }),
      new RegExp(`${name} must not be set`),
    );
  });

  test(`loadConfig refuses a short ${name}`, () => {
    assert.throws(() => loadConfig({ ...base, [name]: "12345" }), /at least 6 characters/);
  });
}

const databaseUrl = process.env.DATABASE_URL;

test("override codes at the routes", { skip: !databaseUrl }, async (t) => {
  const config = loadConfig({
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    OTP_DEV_EXPOSE: "false",
    OTP_OVERRIDE_CODE: OVERRIDE,
    ADMIN_OTP_OVERRIDE_CODE: ADMIN_OVERRIDE,
  });
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const app = buildApp(config, pool);
  t.after(async () => {
    await app.close();
    await pool.end();
  });

  const hash = await hashPassword(PASSWORD, config);
  const email = `override-${randomUUID()}@example.test`;
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, 250) RETURNING id`,
    [`Override Merchant ${randomUUID()}`],
  );
  const merchantId = merchant.rows[0]!.id;
  await pool.query(
    `INSERT INTO merchant_users (merchant_id, email, role, password_hash) VALUES ($1, $2, 'owner', $3)`,
    [merchantId, email, hash],
  );
  const adminEmail = `override-admin-${randomUUID()}@example.test`;
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, display_name, role) VALUES ($1, $2, 'Override Admin', 'support')`,
    [adminEmail, hash],
  );

  const cookieFrom = (setCookie: string | string[] | undefined): string => {
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    assert.ok(header);
    return header.split(";")[0]!;
  };
  const merchantLogin = async (): Promise<string> => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { merchantId, email, password: PASSWORD },
    });
    assert.equal(login.statusCode, 200, login.body);
    return cookieFrom(login.headers["set-cookie"]);
  };
  const verify = (url: string, cookie: string, code: string) =>
    app.inject({ method: "POST", url, headers: { cookie }, payload: { code } });

  await t.test("a merchant override logs in, and the session then works", async () => {
    const cookie = await merchantLogin();
    assert.equal((await verify("/v1/auth/otp/verify", cookie, OVERRIDE)).statusCode, 200);
    const me = await app.inject({ url: "/v1/auth/me", headers: { cookie } });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json<{ merchant: { id: string } }>().merchant.id, merchantId);
  });

  await t.test("the override does not replace the password step", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { merchantId, email, password: OVERRIDE },
    });
    assert.equal(login.statusCode, 401);
    assert.equal((await verify("/v1/auth/otp/verify", "fp_sid=none", OVERRIDE)).statusCode, 401);
  });

  await t.test("a wrong code is still refused and counted", async () => {
    const cookie = await merchantLogin();
    assert.equal((await verify("/v1/auth/otp/verify", cookie, "not-the-code")).statusCode, 401);
  });

  await t.test("an expired challenge still refuses the override", async () => {
    const cookie = await merchantLogin();
    await pool.query(
      `UPDATE otp_challenges SET expires_at = now() - interval '1 second'
        WHERE merchant_user_id = (SELECT id FROM merchant_users WHERE merchant_id = $1)`,
      [merchantId],
    );
    assert.equal((await verify("/v1/auth/otp/verify", cookie, OVERRIDE)).statusCode, 410);
  });

  await t.test("each plane accepts only its own override", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: { email: adminEmail, password: PASSWORD },
    });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = cookieFrom(login.headers["set-cookie"]);
    assert.equal((await verify("/v1/admin/auth/otp/verify", cookie, OVERRIDE)).statusCode, 401);
    assert.equal((await verify("/v1/admin/auth/otp/verify", cookie, ADMIN_OVERRIDE)).statusCode, 200);

    const merchantCookie = await merchantLogin();
    assert.equal((await verify("/v1/auth/otp/verify", merchantCookie, ADMIN_OVERRIDE)).statusCode, 401);
  });
});
