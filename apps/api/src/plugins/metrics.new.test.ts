import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import Fastify from "fastify";
import { loadConfig } from "../config.js";
import { createApiMetrics, metricsPlugin, startMetricsServer } from "./metrics.js";

const MERCHANT_ID = "1d85783b-aa8f-4dd5-850d-87d66d2e7d8c";

async function appWithMetrics() {
  const metrics = createApiMetrics();
  const app = Fastify();
  await app.register(metricsPlugin, { metrics });
  await app.register(
    async (scope) => {
      scope.get("/merchants/:id", async () => ({ ok: true }));
      scope.get("/boom", async () => {
        throw new Error("boom");
      });
    },
    { prefix: "/v1" },
  );
  return { app, metrics };
}

test("labels use the route template, never the merchant ID in the URL", async () => {
  const { app, metrics } = await appWithMetrics();
  await app.inject({ method: "GET", url: `/v1/merchants/${MERCHANT_ID}` });

  const body = await metrics.registry.metrics();
  assert.match(body, /http_request_duration_seconds_count\{method="GET",route="\/v1\/merchants\/:id",status_class="2xx"\} 1/);
  assert.ok(!body.includes(MERCHANT_ID));
});

test("unknown URLs share one label, so a scanner can't create new series", async () => {
  const { app, metrics } = await appWithMetrics();
  await app.inject({ method: "GET", url: "/wp-admin/one" });
  await app.inject({ method: "GET", url: "/wp-admin/two" });

  const body = await metrics.registry.metrics();
  assert.match(body, /http_request_duration_seconds_count\{method="GET",route="unmatched",status_class="4xx"\} 2/);
  assert.ok(!body.includes("wp-admin"));
});

test("a thrown error is counted as 5xx", async () => {
  const { app, metrics } = await appWithMetrics();
  await app.inject({ method: "GET", url: "/v1/boom" });

  assert.match(await metrics.registry.metrics(), /route="\/v1\/boom",status_class="5xx"\} 1/);
});

test("the metrics server answers /metrics and nothing else", async () => {
  const metrics = createApiMetrics();
  const server = startMetricsServer(metrics, 0);
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ok = await fetch(`${base}/metrics`);
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /nodejs_eventloop_lag_seconds/);
    assert.equal((await fetch(`${base}/`)).status, 404);
    assert.equal((await fetch(`${base}/metrics`, { method: "POST" })).status, 404);
  } finally {
    server.close();
  }
});

test("metrics stay off unless METRICS_PORT is set", () => {
  const env = { DATABASE_URL: "postgres://unused/unused", NODE_ENV: "test" };
  assert.equal(loadConfig(env).metricsPort, 0);
  assert.equal(loadConfig({ ...env, METRICS_PORT: "9464" }).metricsPort, 9464);
});
