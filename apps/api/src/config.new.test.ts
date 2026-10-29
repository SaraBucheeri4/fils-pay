import assert from "node:assert/strict";
import { test } from "node:test";
import { DEV_FALLBACK_WEBHOOK_KEY_B64, loadConfig } from "./config.js";

// loadConfig never connects, so an unreachable DATABASE_URL is fine here.
const BASE_ENV = { DATABASE_URL: "postgres://unused/unused" };

test("dev fallback webhook key decodes to exactly 32 bytes", () => {
  assert.equal(Buffer.from(DEV_FALLBACK_WEBHOOK_KEY_B64, "base64").length, 32);
});

test("loadConfig boots in development with no WEBHOOK_SECRET_ENCRYPTION_KEY", () => {
  const config = loadConfig({ ...BASE_ENV, NODE_ENV: "development" });
  assert.equal(config.webhookSecretEncryptionKey, DEV_FALLBACK_WEBHOOK_KEY_B64);
});

test("loadConfig defaults to development and the fallback when NODE_ENV is unset", () => {
  const config = loadConfig({ ...BASE_ENV });
  assert.equal(config.webhookSecretEncryptionKey, DEV_FALLBACK_WEBHOOK_KEY_B64);
});

test("loadConfig never uses the fallback in production", () => {
  assert.throws(
    () =>
      loadConfig({
        ...BASE_ENV,
        NODE_ENV: "production",
        SETTLEMENT_INTERNAL_TOKEN: "t",
        ACQUIRER_CALLBACK_SIGNING_SECRET: "s",
      }),
    /WEBHOOK_SECRET_ENCRYPTION_KEY environment variable is not set/,
  );
});

test("32-byte validation still rejects a wrong-length key", () => {
  const thirtyFourBytes = Buffer.from("test-key-for-dev-only-not-for-prod").toString("base64");
  assert.throws(
    () => loadConfig({ ...BASE_ENV, WEBHOOK_SECRET_ENCRYPTION_KEY: thirtyFourBytes }),
    /must base64-decode to exactly 32 bytes, got 34/,
  );
});
