import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { REPORTING_EVENT_TYPES } from "./runConsumerPass.js";

// The lag metric repeats this list in SQL. A type missing there would hide lag.
test("the reporting lag metric covers every event type the consumer reads", () => {
  const collector = readFileSync(new URL("../../../../ops/observability/sql-exporter/filspay.collector.yml", import.meta.url), "utf8");
  for (const eventType of REPORTING_EVENT_TYPES) {
    assert.ok(collector.includes(`'${eventType}'`), `${eventType} is missing from the reporting_lag query`);
  }
});
