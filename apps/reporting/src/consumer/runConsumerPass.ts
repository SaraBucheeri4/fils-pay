import type { Pool, PoolClient } from "pg";
import type { EventType } from "@filspay/events";
import { withTransaction } from "../db/withTransaction.js";
import type { ReportingConfig } from "../config.js";
import { readCursor, advanceCursor } from "./cursor.js";
import { applyEvent, type OutboxEventRow } from "./applyEvent.js";

export const REPORTING_EVENT_TYPES: readonly EventType[] = [
  "transaction.captured",
  "transaction.voided",
  "settlement.batch_closed",
  "settlement.paid",
  "refund.succeeded",
];

/**
 * Durable identity shared by workers, catch-up and rebuilds.
 */
export const CONSUMER_NAME = "reporting";

/**
 * Serializes each pass by consumer identity. Rollups and per-event receipts
 * commit together. The watermark is diagnostic; late commits remain eligible
 * until their own receipt exists, regardless of sequence allocation order.
 */
export async function runConsumerPass(
  pool: Pool,
  config: Pick<ReportingConfig, "consumerBatchLimit">,
): Promise<{ processedCount: number }> {
  return withTransaction(pool, (client) => applyConsumerBatch(client, config));
}

export async function applyConsumerBatch(client: PoolClient, config: Pick<ReportingConfig, "consumerBatchLimit">): Promise<{ processedCount: number }> {
  const cursor = await readCursor(client, CONSUMER_NAME);

  const eventsResult = await client.query<OutboxEventRow>(
    `SELECT id, event_type, aggregate_id, payload, created_at
       FROM outbox_events
      WHERE NOT EXISTS (SELECT 1 FROM reporting_consumed_events r WHERE r.consumer_name = $1 AND r.outbox_event_id = outbox_events.id)
        AND event_type = ANY($2::text[])
      ORDER BY id ASC
      LIMIT $3`,
    [CONSUMER_NAME, REPORTING_EVENT_TYPES, config.consumerBatchLimit],
  );

  // FH: redundant with ORDER BY id ASC (last row is max). harmless
  let maxId = cursor.lastProcessedId;
  for (const row of eventsResult.rows) {
    await applyEvent(client, row);
    await client.query(`INSERT INTO reporting_consumed_events (consumer_name, outbox_event_id) VALUES ($1, $2)`, [CONSUMER_NAME, row.id.toString()]);
    const rowId = BigInt(row.id);
    if (rowId > maxId) maxId = rowId;
  }

  if (eventsResult.rows.length > 0) {
    await advanceCursor(client, CONSUMER_NAME, maxId);
  }

  return { processedCount: eventsResult.rows.length };
}
