import type { Pool } from "pg";
import { insertAdminAuditLog } from "../adminAudit/log.js";
import { withTransaction } from "../db/withTransaction.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { insertReplayDeliveryRow } from "./replay.js";

const MAX_ARCHIVE_DELIVERIES = 1000;
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;

export interface ArchivedDeliveryEntry {
  deliveryId: string;
  outboxEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CreateArchiveResult {
  archiveId: string;
  deliveryCount: number;
}

/**
 * Snapshots every delivery for one endpoint in [from, to) into a single
 * retained row. Oversized windows are rejected, never silently truncated:
 * at most 1000 deliveries and 4 MiB per archive. A repeatable-read snapshot
 * makes the SQL budget check and materialization see the same deliveries.
 */
export async function createWebhookDeliveryArchive(
  pool: Pool,
  input: { merchantId: string; endpointId: string; adminUserId: string; from: Date; to: Date },
): Promise<CreateArchiveResult> {
  return withTransaction(pool, async (client) => {
    await client.query(`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
    if (!Number.isFinite(input.from.getTime()) || !Number.isFinite(input.to.getTime()) || input.from >= input.to) {
      throw new ConflictError("invalid_archive_window");
    }
    const endpoint = await client.query<{ id: string }>(
      `SELECT id FROM webhook_endpoints WHERE id = $1 AND merchant_id = $2`,
      [input.endpointId, input.merchantId],
    );
    if (!endpoint.rows[0]) {
      throw new NotFoundError("webhook_endpoint_not_found");
    }

    // Reject oversized ranges in SQL before materializing their JSON in Node.
    const budget = await client.query<{ count: string; bytes: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(octet_length(payload::text) + 512), 0)::text AS bytes
       FROM webhook_deliveries WHERE endpoint_id = $1 AND created_at >= $2 AND created_at < $3`,
      [input.endpointId, input.from, input.to],
    );
    if (Number(budget.rows[0]!.count) > MAX_ARCHIVE_DELIVERIES || Number(budget.rows[0]!.bytes) > MAX_ARCHIVE_BYTES) {
      throw new ConflictError("archive_too_large", "Choose a smaller archive date range");
    }
    const rows = await client.query<{
      id: string;
      outbox_event_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT id, outbox_event_id, event_type, payload, created_at
         FROM webhook_deliveries
        WHERE endpoint_id = $1 AND created_at >= $2 AND created_at < $3
        ORDER BY created_at ASC LIMIT 1001`,
      [input.endpointId, input.from, input.to],
    );

    if (rows.rows.length > MAX_ARCHIVE_DELIVERIES || Buffer.byteLength(JSON.stringify(rows.rows)) > MAX_ARCHIVE_BYTES) {
      throw new ConflictError("archive_too_large", "Choose a smaller archive date range");
    }

    const entries: ArchivedDeliveryEntry[] = rows.rows.map((r) => ({
      deliveryId: r.id,
      outboxEventId: r.outbox_event_id,
      eventType: r.event_type,
      payload: r.payload,
      createdAt: r.created_at.toISOString(),
    }));
    if (Buffer.byteLength(JSON.stringify(entries)) > MAX_ARCHIVE_BYTES) throw new ConflictError("archive_too_large");

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO webhook_delivery_archives
          (endpoint_id, merchant_id, created_by_admin_user_id, from_created_at, to_created_at, delivery_count, archive_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.endpointId,
        input.merchantId,
        input.adminUserId,
        input.from,
        input.to,
        entries.length,
        JSON.stringify(entries),
      ],
    );

    await insertAdminAuditLog(client, {
      adminUserId: input.adminUserId,
      action: "webhook_delivery_archive_create",
      targetType: "webhook_endpoint",
      targetId: input.endpointId,
      metadata: { merchantId: input.merchantId, deliveryCount: entries.length },
    });

    return { archiveId: inserted.rows[0]!.id, deliveryCount: entries.length };
  });
}

/**
 * Bulk-replays every delivery captured in a previously created archive —
 * used to backfill a newly registered replacement endpoint with a
 * merchant's delivery history after a URL rotation, without asking the
 * merchant to re-trigger months of real events. The archive is the
 * complete unit of work by construction (it was written as one row, one
 * JSON document, at creation time), so reading it back the same way mirrors
 * how it was captured.
 */
export async function pruneExpiredArchives(
  _pool: Pool,
  _retentionDays: number,
): Promise<{ deletedCount: number }> {
  // ADR-0008 retains audit history. No historical purge is authorized.
  return { deletedCount: 0 };
}

export async function replayWebhookDeliveryArchive(
  pool: Pool,
  input: { merchantId: string; archiveId: string; targetEndpointId: string; adminUserId: string },
): Promise<{ replayedCount: number }> {
  return withTransaction(pool, async (client) => {
    const archiveResult = await client.query<{ archive_payload: string | null }>(
      `SELECT CASE WHEN octet_length(archive_payload) <= 4194304 AND delivery_count <= 1000 THEN archive_payload ELSE NULL END AS archive_payload
       FROM webhook_delivery_archives WHERE id = $1 AND merchant_id = $2`,
      [input.archiveId, input.merchantId],
    );
    const archiveRow = archiveResult.rows[0];
    if (!archiveRow) {
      throw new NotFoundError("webhook_delivery_archive_not_found");
    }
    if (archiveRow.archive_payload === null) throw new ConflictError("archive_too_large", "Legacy archive requires a bounded offline replay");

    const targetEndpoint = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM webhook_endpoints WHERE id = $1 AND merchant_id = $2`,
      [input.targetEndpointId, input.merchantId],
    );
    const targetRow = targetEndpoint.rows[0];
    if (!targetRow) {
      throw new NotFoundError("webhook_endpoint_not_found");
    }
    if (targetRow.status !== "active") {
      throw new ConflictError("endpoint_disabled");
    }

    const entries = JSON.parse(archiveRow.archive_payload) as ArchivedDeliveryEntry[];
    if (!Array.isArray(entries) || entries.length > MAX_ARCHIVE_DELIVERIES) throw new ConflictError("archive_too_large");

    let replayedCount = 0;
    for (const entry of entries) {
      await insertReplayDeliveryRow(client, {
        id: entry.deliveryId,
        endpointId: input.targetEndpointId,
        outboxEventId: entry.outboxEventId,
        eventType: entry.eventType,
        payload: entry.payload,
      });
      replayedCount++;
    }

    await insertAdminAuditLog(client, {
      adminUserId: input.adminUserId,
      action: "webhook_delivery_archive_replay",
      targetType: "webhook_endpoint",
      targetId: input.targetEndpointId,
      metadata: { merchantId: input.merchantId, archiveId: input.archiveId, replayedCount },
    });

    return { replayedCount };
  });
}
