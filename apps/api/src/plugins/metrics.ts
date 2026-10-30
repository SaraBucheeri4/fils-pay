import { createServer, type Server } from "node:http";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";

const UNMATCHED_ROUTE = "unmatched";

export interface ApiMetrics {
  registry: Registry;
  requestDuration: Histogram<"method" | "route" | "status_class">;
  dispatcherLastPass: Gauge;
}

/** Counts and timings only. Labels are never merchant IDs, tokens or amounts. */
export function createApiMetrics(): ApiMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  return {
    registry,
    requestDuration: new Histogram({
      name: "http_request_duration_seconds",
      help: "API request duration. Its _count series is the request rate.",
      labelNames: ["method", "route", "status_class"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    dispatcherLastPass: new Gauge({
      name: "webhook_dispatcher_last_pass_timestamp_seconds",
      help: "When the webhook dispatcher last finished a pass without an error.",
      registers: [registry],
    }),
  };
}

/** Uses the route template, so the label set can't grow with request URLs. */
export const metricsPlugin = fp<{ metrics: ApiMetrics }>(async (app: FastifyInstance, { metrics }) => {
  app.addHook("onResponse", async (request, reply) => {
    metrics.requestDuration.observe(
      {
        method: request.method,
        route: request.routeOptions.url ?? UNMATCHED_ROUTE,
        status_class: `${Math.floor(reply.statusCode / 100)}xx`,
      },
      reply.elapsedTime / 1000,
    );
  });
});

/**
 * Serves /metrics on its own port, outside Fastify, so it can't be reached
 * through the public gateway and doesn't count against the rate limiter.
 * Only index.ts starts this, and only when METRICS_PORT is set.
 */
export function startMetricsServer(metrics: ApiMetrics, port: number): Server {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/metrics") {
      response.writeHead(404).end();
      return;
    }
    metrics.registry
      .metrics()
      .then((body) => {
        response.writeHead(200, { "Content-Type": metrics.registry.contentType }).end(body);
      })
      .catch((err: unknown) => {
        console.error("[metrics] failed to render metrics", err);
        response.writeHead(500).end();
      });
  });
  // Monitoring must never take the API down, so a bind failure is only logged.
  server.on("error", (err) => {
    console.error("[metrics] server error", err);
  });
  server.listen(port, "0.0.0.0");
  return server;
}
