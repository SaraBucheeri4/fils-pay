import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { ROUTE_RATE_LIMITS, createPostgresRateLimitStore, type RateLimitStore } from "./rateLimit.js";

// Route tests use an in-memory store and stop at the limiter or at validation,
// so the pool is never queried and these run without a database.
const baseEnv = { DATABASE_URL: "postgres://unused@127.0.0.1:1/unused", NODE_ENV: "test", RATE_LIMIT_ENABLED: "true" };

function memoryStore(): RateLimitStore & { keys: () => number } {
  const counts = new Map<string, number>();
  return {
    keys: () => counts.size,
    async hit(key) {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { count, resetAt: new Date(Date.now() + 60_000) };
    },
  };
}

function appWith(store: RateLimitStore, env: Record<string, string> = {}) {
  const pool = new pg.Pool({ connectionString: baseEnv.DATABASE_URL });
  return { app: buildApp(loadConfig({ ...baseEnv, ...env }), pool, { rateLimitStore: store }), pool };
}

const LOGIN_IP_LIMIT = ROUTE_RATE_LIMITS["POST /v1/auth/login"]![0]!.limit;
const LOGIN_ACCOUNT_LIMIT = ROUTE_RATE_LIMITS["POST /v1/auth/login"]![1]!.limit;

test("every rule names a route that exists", async () => {
  const { app, pool } = appWith(memoryStore());
  const registered = new Set<string>();
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) registered.add(`${method} ${route.url}`);
  });
  await app.ready();
  for (const route of Object.keys(ROUTE_RATE_LIMITS)) {
    assert.ok(registered.has(route), `${route} is not a registered route`);
  }
  await app.close();
  await pool.end();
});

test("over budget returns 429 rate_limited with Retry-After, in the API's error shape", async () => {
  const { app, pool } = appWith(memoryStore());
  // No password, so each allowed request is a 400 that never reaches argon2.
  const send = (ip: string) =>
    app.inject({ method: "POST", url: "/v1/auth/login", remoteAddress: ip, payload: { email: "a@x.test" } });

  for (let i = 0; i < LOGIN_ACCOUNT_LIMIT; i += 1) {
    const allowed = await send("203.0.113.1");
    assert.equal(allowed.statusCode, 400);
    assert.equal(allowed.headers["ratelimit-remaining"], String(LOGIN_ACCOUNT_LIMIT - i - 1));
  }

  const blocked = await send("203.0.113.1");
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().error, "rate_limited");
  assert.ok(Number(blocked.headers["retry-after"]) >= 1);
  assert.equal(blocked.headers["ratelimit-remaining"], "0");
  await app.close();
  await pool.end();
});

test("the account budget follows the email across IPs and letter case", async () => {
  const { app, pool } = appWith(memoryStore());
  for (let i = 0; i < LOGIN_ACCOUNT_LIMIT; i += 1) {
    await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      remoteAddress: `203.0.113.${i + 1}`,
      payload: { email: i % 2 === 0 ? "victim@x.test" : "VICTIM@x.test" },
    });
  }
  const blocked = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    remoteAddress: "203.0.113.200",
    payload: { email: "Victim@X.test" },
  });
  assert.equal(blocked.statusCode, 429);
  await app.close();
  await pool.end();
});

test("a client past its IP budget cannot keep spending a victim's account budget", async () => {
  const { app, pool } = appWith(memoryStore());
  for (let i = 0; i < LOGIN_IP_LIMIT + 5; i += 1) {
    await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      remoteAddress: "203.0.113.1",
      payload: { email: `other${i}@x.test` },
    });
  }
  const attacked = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    remoteAddress: "203.0.113.1",
    payload: { email: "victim@x.test" },
  });
  assert.equal(attacked.statusCode, 429);

  const owner = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    remoteAddress: "198.51.100.7",
    payload: { email: "victim@x.test" },
  });
  assert.equal(owner.statusCode, 400);
  assert.equal(owner.headers["ratelimit-remaining"], String(LOGIN_ACCOUNT_LIMIT - 1));
  await app.close();
  await pool.end();
});

test("OTP verify is capped per pending session, whichever IP it comes from", async () => {
  const { app, pool } = appWith(memoryStore());
  const send = (i: number, cookie: string) =>
    app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      remoteAddress: `203.0.113.${i + 1}`,
      cookies: { fp_sid: cookie },
      payload: {},
    });
  const limit = ROUTE_RATE_LIMITS["POST /v1/auth/otp/verify"]![1]!.limit;
  for (let i = 0; i < limit; i += 1) {
    assert.equal((await send(i, "session-a")).statusCode, 400);
  }
  assert.equal((await send(100, "session-a")).statusCode, 429);
  assert.equal((await send(101, "session-b")).statusCode, 400);
  await app.close();
  await pool.end();
});

test("X-Forwarded-For counts only when a trusted proxy sent it", async () => {
  const { app, pool } = appWith(memoryStore());
  // A public socket address cannot choose its own bucket by forging the header.
  for (let i = 0; i < LOGIN_IP_LIMIT; i += 1) {
    await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      remoteAddress: "203.0.113.9",
      headers: { "x-forwarded-for": `198.51.100.${i}` },
      payload: {},
    });
  }
  const spoofed = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    remoteAddress: "203.0.113.9",
    headers: { "x-forwarded-for": "198.51.100.250" },
    payload: {},
  });
  assert.equal(spoofed.statusCode, 429);

  // The compose network's proxy (a private address) does vouch for its clients.
  const proxied = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    remoteAddress: "172.18.0.5",
    headers: { "x-forwarded-for": "198.51.100.77" },
    payload: {},
  });
  assert.equal(proxied.statusCode, 400);
  await app.close();
  await pool.end();
});

test("health checks, docs and acquirer callbacks are exempt", async () => {
  const store = memoryStore();
  const { app, pool } = appWith(store);
  assert.equal((await app.inject({ url: "/healthz" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/v1/docs/json" })).statusCode, 200);
  await app.inject({ method: "POST", url: "/v1/acquirer/callbacks", payload: {} });
  assert.equal(store.keys(), 0);
  await app.close();
  await pool.end();
});

test("the limiter fails open when its store is down", async () => {
  const broken: RateLimitStore = { hit: async () => { throw new Error("db down"); } };
  const { app, pool } = appWith(broken);
  const response = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "a@x.test" } });
  assert.equal(response.statusCode, 400);
  await app.close();
  await pool.end();
});

test("RATE_LIMIT_ENABLED=false adds no limiter", async () => {
  const store = memoryStore();
  const { app, pool } = appWith(store, { RATE_LIMIT_ENABLED: "false" });
  await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "a@x.test" } });
  assert.equal(store.keys(), 0);
  await app.close();
  await pool.end();
});

test("the Postgres store counts atomically and resets expired windows", { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const store = createPostgresRateLimitStore(pool);
  const key = `test:${Date.now()}`;
  try {
    const hits = await Promise.all(Array.from({ length: 5 }, () => store.hit(key, 60)));
    assert.deepEqual(hits.map((hit) => hit.count).sort(), [1, 2, 3, 4, 5]);

    await pool.query(`UPDATE rate_limit_counters SET reset_at = now() - interval '1 second' WHERE key = $1`, [key]);
    const fresh = await store.hit(key, 60);
    assert.equal(fresh.count, 1);
    assert.ok(fresh.resetAt.getTime() > Date.now());
  } finally {
    await pool.query(`DELETE FROM rate_limit_counters WHERE key = $1`, [key]);
    await pool.end();
  }
});
