/**
 * B59: corrected copy of the backoff/exhaustion test in dispatcher.test.ts
 * (locked, left unchanged). The original asserted
 * `backoffDelayMs(n, config) === 1000 * 2 ** (n - 1)`, but backoffDelayMs
 * applies ±10 % random jitter by design, so it failed on almost every run.
 * Here the exact values are checked with a fixed jitter source, and the
 * delay actually written to the row is checked against the jitter range.
 * Requires DATABASE_URL to point at a real, migrated Postgres.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { enqueueEvent } from "@filspay/events";
import { loadConfig } from "../config.js";
import { createWebhookEndpoint } from "./create.js";
import { backoffDelayMs, runDispatchPass } from "./dispatcher.js";
import type { WebhookTransport } from "./transport.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("dispatcher.backoff.new.test.ts requires DATABASE_URL to point at a real, migrated Postgres");
}

const config = loadConfig({
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token",
  WEBHOOK_SECRET_ENCRYPTION_KEY: "Y1ZTGTcYbe30GZJebys9w7T3OYZNKewuOH3SUCEdRQk=",
  WEBHOOK_MAX_ATTEMPTS: "3",
  WEBHOOK_BACKOFF_BASE_MS: "1000",
  WEBHOOK_BACKOFF_CAP_MS: "60000",
  WEBHOOK_REQUEST_TIMEOUT_MS: "5000",
});

const pool = new Pool({ connectionString: databaseUrl, max: 5 });

test.after(async () => {
  await pool.end();
});

/** The jitter multiplier is 0.9 + jitter() * 0.2, i.e. within ±10 %. */
const JITTER_LOW = 0.9;
const JITTER_HIGH = 1.1;

test("backoffDelayMs: exact values with a fixed jitter source", () => {
  const midpoint = () => 0.5;
  assert.equal(backoffDelayMs(1, config, midpoint), 1000);
  assert.equal(backoffDelayMs(2, config, midpoint), 2000);
  assert.equal(backoffDelayMs(3, config, midpoint), 4000);

  assert.equal(backoffDelayMs(1, config, () => 0), 900);
  assert.equal(backoffDelayMs(1, config, () => 1), 1100);

  // Capped at webhookBackoffCapMs before jitter is applied.
  assert.equal(backoffDelayMs(20, config, midpoint), 60_000);
});

test("backoffDelayMs: default jitter stays within ±10 %", () => {
  for (let i = 0; i < 200; i++) {
    const delay = backoffDelayMs(1, config);
    assert.ok(delay >= 900 && delay <= 1100, `delay ${delay} outside 900–1100`);
  }
});

async function createMerchant(label: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO merchants (display_name, mdr_bps) VALUES ($1, $2) RETURNING id`,
    [`Dispatcher Backoff Merchant ${label} ${randomUUID()}`, 250],
  );
  return result.rows[0]!.id;
}

async function enqueueCaptured(merchantId: string) {
  return enqueueEvent(pool, {
    eventType: "transaction.captured",
    aggregateType: "transaction",
    aggregateId: randomUUID(),
    payload: {
      merchantId,
      amountCapturedFils: 4_750,
      feeFils: 71,
      newStatus: "captured",
      capturedTotalFils: 4_750,
    },
  });
}

async function forceDueNow(deliveryId: string): Promise<void> {
  await pool.query(`UPDATE webhook_deliveries SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [
    deliveryId,
  ]);
}

interface DeliveryRow {
  id: string;
  status: string;
  attempt_count: number;
  next_attempt_at: Date;
  last_attempted_at: Date;
  response_status_code: number | null;
}

async function getDelivery(outboxEventId: string, endpointId: string): Promise<DeliveryRow> {
  const result = await pool.query<DeliveryRow>(
    `SELECT * FROM webhook_deliveries WHERE outbox_event_id = $1 AND endpoint_id = $2 AND replay_of_delivery_id IS NULL`,
    [outboxEventId, endpointId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("expected a webhook_deliveries row");
  return row;
}

/** The dispatcher sets next_attempt_at = now() + delay and last_attempted_at
 *  = now() in one statement, so their difference is exactly the delay it
 *  applied, independent of how long the pass or this test took. */
function assertDelayInJitterRange(delivery: DeliveryRow, attempt: number): void {
  const base = config.webhookBackoffBaseMs * 2 ** (attempt - 1);
  const applied = delivery.next_attempt_at.getTime() - delivery.last_attempted_at.getTime();
  const min = Math.round(base * JITTER_LOW);
  const max = Math.round(base * JITTER_HIGH);
  assert.ok(applied >= min && applied <= max, `attempt ${attempt}: applied ${applied}ms, expected ${min}–${max}ms`);
}

test("failing endpoint: backoff/exhaustion sequence, delays within the jitter range, exhausted at webhookMaxAttempts", async () => {
  const merchantId = await createMerchant("backoff-exhaustion");
  const endpoint = await createWebhookEndpoint(pool, config, {
    merchantId,
    url: `http://fake-receiver.test/always-500-${randomUUID()}`,
    createdByType: "merchant_session",
    createdById: randomUUID(),
  });
  const outboxEvent = await enqueueCaptured(merchantId);
  const transport: WebhookTransport = async () => ({ statusCode: 500, body: "server error" });

  // Pass 1: creates the row and attempts it immediately.
  await runDispatchPass(pool, transport, config);
  let delivery = await getDelivery(String(outboxEvent.id), endpoint.id);
  assert.equal(delivery.status, "pending");
  assert.equal(delivery.attempt_count, 1);
  assert.equal(delivery.response_status_code, 500);
  assertDelayInJitterRange(delivery, 1);

  // Pass 2: not due yet, so no new attempt for this delivery.
  await runDispatchPass(pool, transport, config);
  delivery = await getDelivery(String(outboxEvent.id), endpoint.id);
  assert.equal(delivery.attempt_count, 1);

  // Attempt 2: still pending (max attempts = 3).
  await forceDueNow(delivery.id);
  await runDispatchPass(pool, transport, config);
  delivery = await getDelivery(String(outboxEvent.id), endpoint.id);
  assert.equal(delivery.status, "pending");
  assert.equal(delivery.attempt_count, 2);
  assertDelayInJitterRange(delivery, 2);

  // Attempt 3 === webhookMaxAttempts: exhausted.
  await forceDueNow(delivery.id);
  await runDispatchPass(pool, transport, config);
  delivery = await getDelivery(String(outboxEvent.id), endpoint.id);
  assert.equal(delivery.status, "exhausted");
  assert.equal(delivery.attempt_count, 3);

  // Exhausted deliveries are never picked up again, even if forced due.
  await forceDueNow(delivery.id);
  await runDispatchPass(pool, transport, config);
  delivery = await getDelivery(String(outboxEvent.id), endpoint.id);
  assert.equal(delivery.status, "exhausted");
  assert.equal(delivery.attempt_count, 3);
});
