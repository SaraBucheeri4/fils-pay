#!/usr/bin/env -S npx tsx
/**
 * Regenerates docs/api/filspay.postman_collection.json from the OpenAPI spec.
 * Run after changing apps/api/src/docs/openapi.ts: npm run postman
 * Touches no database or network.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPostmanCollection } from "../apps/api/src/docs/postman.js";

const output = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "api", "filspay.postman_collection.json");

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(buildPostmanCollection(), null, 2)}\n`);
console.log(`wrote ${output}`);
