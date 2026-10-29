#!/usr/bin/env -S npx tsx
/**
 * Nightly janitor: a hold that's never captured or released just sits in
 * the table past its expires_at forever — nothing else in the platform
 * ever deletes a holds row (authorize.ts inserts one, capture.ts/void.ts
 * release one; nothing sweeps one). Run once a night from cron/the host's
 * own scheduler.
 *
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/expire_holds.ts
 */
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { buildDelete } from "./lib/sqlFilter.js";

/** Holds that outlived their authorization window without being captured
 *  or released — the candidate set for tonight's cleanup. */
export async function fetchExpiredHoldIds(client: Client): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM holds WHERE status = 'active' AND expires_at < now()`,
  );
  return result.rows.map((r) => r.id);
}

/** No longer used by main(); kept because expire_holds.test.ts imports it.
 *  Throws on an empty id list rather than deleting the whole table. */
export function buildExpiredHoldsDelete(expiredIds: string[]): { text: string; values: unknown[] } {
  return buildDelete("holds", { id: expiredIds });
}

/** Flips abandoned holds to 'expired' in one statement (HANDOVER: holds are
 *  never deleted). The status guard means a hold captured or released
 *  concurrently is left alone, and a night with nothing expired changes no rows. */
export const EXPIRE_HOLDS_SQL =
  `UPDATE holds SET status = 'expired' WHERE status = 'active' AND expires_at < now()`;

/** Marks only holds that are still 'active' and past expires_at as expired. */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("expire_holds: DATABASE_URL environment variable is not set");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(EXPIRE_HOLDS_SQL);
    console.log(`expire_holds: marked ${result.rowCount ?? 0} abandoned hold(s) as expired`);
  } finally {
    await client.end();
  }
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
