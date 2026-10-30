import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest, preValidationHookHandler } from "fastify";
import fp from "fastify-plugin";
import type { Pool } from "pg";
import type { Config } from "../config.js";
import { TooManyRequestsError } from "../lib/errors.js";

export interface RateLimitHit {
  count: number;
  resetAt: Date;
}

/** Counts one request against `key` and returns the window's running total. */
export interface RateLimitStore {
  hit(key: string, windowSeconds: number): Promise<RateLimitHit>;
}

const EXPIRED_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Shared across API instances and survives a restart, so neither one hands an
 * attacker a fresh OTP or password budget. The upsert is a single atomic
 * statement: parallel requests cannot all read the same count.
 */
export function createPostgresRateLimitStore(pool: Pool): RateLimitStore {
  let lastSweepAt = Date.now();

  return {
    async hit(key, windowSeconds) {
      if (Date.now() - lastSweepAt >= EXPIRED_SWEEP_INTERVAL_MS) {
        lastSweepAt = Date.now();
        void pool.query(`DELETE FROM rate_limit_counters WHERE reset_at <= now()`).catch(() => {});
      }

      const result = await pool.query<{ count: number; reset_at: Date }>(
        `INSERT INTO rate_limit_counters AS c (key, count, reset_at)
         VALUES ($1, 1, now() + make_interval(secs => $2))
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN c.reset_at <= now() THEN 1 ELSE c.count + 1 END,
           reset_at = CASE WHEN c.reset_at <= now() THEN EXCLUDED.reset_at ELSE c.reset_at END
         RETURNING count, reset_at`,
        [key, windowSeconds],
      );
      const row = result.rows[0];
      if (!row) throw new Error("rate limit upsert returned no row");
      return { count: row.count, resetAt: row.reset_at };
    },
  };
}

export interface RateLimitRule {
  /** Namespaces the counter. Rules with the same name share a budget. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** The value to count per, or null when this request doesn't have one (a
   *  missing body field, say), which skips the rule. */
  key: (request: FastifyRequest, config: Config) => string | null;
}

const FIFTEEN_MINUTES = 15 * 60;
const ONE_MINUTE = 60;
const ONE_HOUR = 60 * 60;

const byIp = (request: FastifyRequest): string => request.ip;

function byCookie(pick: (config: Config) => string): RateLimitRule["key"] {
  return (request, config) => request.cookies[pick(config)] ?? null;
}

/** Case-folded because `A@x.com` and `a@x.com` must not get separate budgets. */
function normalisedBodyField(request: FastifyRequest, field: string): string | null {
  const value = (request.body as Record<string, unknown> | null | undefined)?.[field];
  return typeof value === "string" && value !== "" ? value.trim().toLowerCase() : null;
}

function byLoginAccount(request: FastifyRequest): string | null {
  const email = normalisedBodyField(request, "email");
  if (!email) return null;
  return `${normalisedBodyField(request, "merchantId") ?? ""}|${email}`;
}

const byPaymentLinkToken = (request: FastifyRequest): string | null =>
  (request.params as { token?: string }).token ?? null;

const loginRules = (plane: string): RateLimitRule[] => [
  // IP first: a client already over its IP budget stops here, so it can't also
  // spend the budget of an account it is attacking.
  { name: `${plane}_login_ip`, limit: 20, windowSeconds: FIFTEEN_MINUTES, key: byIp },
  { name: `${plane}_login_account`, limit: 10, windowSeconds: FIFTEEN_MINUTES, key: byLoginAccount },
];

const otpVerifyRules = (plane: string, cookie: (config: Config) => string): RateLimitRule[] => [
  { name: `${plane}_otp_verify_ip`, limit: 30, windowSeconds: FIFTEEN_MINUTES, key: byIp },
  { name: `${plane}_otp_verify_session`, limit: 10, windowSeconds: FIFTEEN_MINUTES, key: byCookie(cookie) },
];

/**
 * Routes that need more than the default budget. Everything here is either an
 * unauthenticated credential check, or a request that costs far more than its
 * size suggests. Keys are the full route path, without a trailing slash.
 */
export const ROUTE_RATE_LIMITS: Readonly<Record<string, readonly RateLimitRule[]>> = {
  "POST /v1/auth/login": loginRules("merchant"),
  "POST /v1/auth/otp/verify": otpVerifyRules("merchant", (config) => config.cookieName),
  "POST /v1/auth/otp/resend": [
    { name: "merchant_otp_resend_ip", limit: 20, windowSeconds: FIFTEEN_MINUTES, key: byIp },
    {
      name: "merchant_otp_resend_session",
      limit: 5,
      windowSeconds: FIFTEEN_MINUTES,
      key: byCookie((config) => config.cookieName),
    },
  ],
  "POST /v1/admin/auth/login": loginRules("admin"),
  "POST /v1/admin/auth/otp/verify": otpVerifyRules("admin", (config) => config.adminCookieName),
  // Public, and each signup runs an argon2 hash.
  "POST /v1/merchants": [{ name: "signup_ip", limit: 10, windowSeconds: ONE_HOUR, key: byIp }],
  // Public card entry: the classic card-testing target.
  "POST /v1/payment-links/:token/pay": [
    { name: "link_pay_ip", limit: 20, windowSeconds: ONE_MINUTE, key: byIp },
    { name: "link_pay_token", limit: 30, windowSeconds: ONE_MINUTE, key: byPaymentLinkToken },
  ],
  "GET /v1/payment-links/:token": [{ name: "link_read_ip", limit: 120, windowSeconds: ONE_MINUTE, key: byIp }],
  "GET /v1/transactions/export": [{ name: "transactions_export_ip", limit: 10, windowSeconds: ONE_MINUTE, key: byIp }],
  // Makes an outbound HTTP call and waits for it on the request path.
  "POST /v1/merchants/:merchantId/webhook-endpoints/:id/test": [
    { name: "webhook_test_ip", limit: 10, windowSeconds: ONE_MINUTE, key: byIp },
  ],
};

/**
 * Not limited at all. Health checks must keep answering under load. Acquirer
 * callbacks are signed, and dropping one would lose a fraud-review verdict.
 * Docs are static and touch no database.
 */
export function isRateLimitExempt(url: string): boolean {
  return (
    url === "/healthz" ||
    url === "/readyz" ||
    url === "/v1/acquirer/callbacks" ||
    url === "/v1/docs" ||
    url.startsWith("/v1/docs/")
  );
}

function hashKey(ruleName: string, value: string): string {
  return createHash("sha256").update(`${ruleName}:${value}`).digest("hex");
}

interface RuleOutcome {
  limit: number;
  remaining: number;
  resetAt: Date;
}

function setRateLimitHeaders(reply: FastifyReply, outcome: RuleOutcome): number {
  const resetSeconds = Math.max(1, Math.ceil((outcome.resetAt.getTime() - Date.now()) / 1000));
  reply.header("RateLimit-Limit", outcome.limit);
  reply.header("RateLimit-Remaining", outcome.remaining);
  reply.header("RateLimit-Reset", resetSeconds);
  return resetSeconds;
}

function createLimiter(
  rules: readonly RateLimitRule[],
  store: RateLimitStore,
  config: Config,
): preValidationHookHandler {
  return async (request, reply) => {
    // The rule closest to its limit is the one a client needs to see.
    let tightest: RuleOutcome | null = null;
    try {
      for (const rule of rules) {
        const value = rule.key(request, config);
        if (value === null) continue;

        const hit = await store.hit(hashKey(rule.name, value), rule.windowSeconds);
        const outcome: RuleOutcome = {
          limit: rule.limit,
          remaining: Math.max(0, rule.limit - hit.count),
          resetAt: hit.resetAt,
        };
        if (hit.count > rule.limit) {
          const retryAfter = setRateLimitHeaders(reply, outcome);
          reply.header("Retry-After", retryAfter);
          request.log.warn({ rule: rule.name, route: request.routeOptions.url }, "rate limit exceeded");
          throw new TooManyRequestsError("rate_limited", "Too many requests. Try again later.");
        }
        if (!tightest || outcome.remaining < tightest.remaining) tightest = outcome;
      }
    } catch (err) {
      if (err instanceof TooManyRequestsError) throw err;
      // Fail open. Limiter storage trouble must not take payments down, and a
      // database outage already stops every credential check behind this hook.
      request.log.error({ err }, "rate limiter unavailable, allowing request");
      return;
    }
    if (tightest) setRateLimitHeaders(reply, tightest);
  };
}

export interface RateLimitPluginOptions {
  config: Config;
  store: RateLimitStore;
}

/**
 * Attaches limits through `onRoute`, so this one file is the whole policy and
 * no route file has to know about it. Must be registered before the routes.
 * The hook runs at preValidation: the body is parsed, which the per-account
 * rules need, and no route's preHandler (session lookups included) has run.
 */
export const rateLimitPlugin = fp(async (app: FastifyInstance, options: RateLimitPluginOptions): Promise<void> => {
  const { config, store } = options;
  if (!config.rateLimitEnabled) return;

  const defaultRule: RateLimitRule = {
    name: "default_ip",
    limit: config.rateLimitDefaultPerMinute,
    windowSeconds: ONE_MINUTE,
    key: byIp,
  };

  app.addHook("onRoute", (route) => {
    const url = route.url.length > 1 ? route.url.replace(/\/$/, "") : route.url;
    if (isRateLimitExempt(url)) return;

    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const specific = methods.flatMap((method) => ROUTE_RATE_LIMITS[`${method} ${url}`] ?? []);
    const limiter = createLimiter([defaultRule, ...specific], store, config);

    const existing = route.preValidation;
    route.preValidation = existing ? [limiter, ...(Array.isArray(existing) ? existing : [existing])] : limiter;
  });
});
