import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { API_OPERATIONS, buildOpenApiDocument } from "./openapi.js";
import { buildPostmanCollection } from "./postman.js";

// None of these tests send a query: the pool is lazy and never connects.
const baseEnv = { DATABASE_URL: "postgres://unused@127.0.0.1:1/unused", NODE_ENV: "test" };

function appWith(env: Record<string, string> = {}) {
  const pool = new pg.Pool({ connectionString: baseEnv.DATABASE_URL });
  return { app: buildApp(loadConfig({ ...baseEnv, ...env }), pool), pool };
}

test("the spec documents exactly the routes the API registers", async () => {
  const { app, pool } = appWith({ API_DOCS_ENABLED: "false" });
  const registered = new Set<string>();
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const url = route.url.length > 1 ? route.url.replace(/\/$/, "") : route.url;
    for (const method of methods) {
      if (method !== "HEAD") registered.add(`${method} ${url}`);
    }
  });
  await app.ready();
  await app.close();
  await pool.end();

  const documented = new Set(API_OPERATIONS.map((op) => `${op.method.toUpperCase()} ${op.path}`));
  assert.deepEqual([...registered].filter((route) => !documented.has(route)).sort(), [], "routes missing from the spec");
  assert.deepEqual([...documented].filter((route) => !registered.has(route)).sort(), [], "spec entries with no route");
});

test("the docs page hides internal routes unless asked to show them", async () => {
  const { app, pool } = appWith();
  const publicSpec = (await app.inject({ url: "/v1/docs/json" })).json() as { paths: Record<string, unknown> };
  assert.ok(publicSpec.paths["/v1/transactions"]);
  assert.equal(publicSpec.paths["/v1/admin/merchants"], undefined);
  assert.equal(publicSpec.paths["/v1/acquirer/callbacks"], undefined);
  assert.equal((await app.inject({ url: "/v1/docs/" })).statusCode, 200);
  await app.close();
  await pool.end();

  const internal = appWith({ API_DOCS_INCLUDE_INTERNAL: "true" });
  const fullSpec = (await internal.app.inject({ url: "/v1/docs/json" })).json() as { paths: Record<string, unknown> };
  assert.ok(fullSpec.paths["/v1/admin/merchants"]);
  await internal.app.close();
  await internal.pool.end();
});

test("API_DOCS_ENABLED=false removes the docs routes", async () => {
  const { app, pool } = appWith({ API_DOCS_ENABLED: "false" });
  assert.equal((await app.inject({ url: "/v1/docs/json" })).statusCode, 404);
  await app.close();
  await pool.end();
});

test("every schema reference in the spec resolves", () => {
  const spec = buildOpenApiDocument({ includeInternal: true }) as { components: { schemas: Record<string, unknown> } };
  const refs = JSON.stringify(spec).matchAll(/#\/components\/schemas\/([A-Za-z]+)/g);
  for (const match of refs) {
    assert.ok(spec.components.schemas[match[1]!], `unresolved $ref ${match[1]}`);
  }
});

test("the committed Postman collection matches the spec", () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/api/filspay.postman_collection.json");
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), buildPostmanCollection(), "run: npm run postman");
});

test("the Postman collection covers every operation and declares every variable", () => {
  const collection = buildPostmanCollection() as {
    item: Array<{ item: unknown[] }>;
    variable: Array<{ key: string }>;
  };
  assert.equal(collection.item.reduce((total, folder) => total + folder.item.length, 0), API_OPERATIONS.length);

  const declared = new Set(collection.variable.map((variable) => variable.key));
  for (const match of JSON.stringify(collection.item).matchAll(/\{\{([A-Za-z]+)\}\}/g)) {
    assert.ok(declared.has(match[1]!), `undeclared variable ${match[1]}`);
  }
});
