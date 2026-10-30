import type { Pool } from "pg";

export type DeleteWebhookEndpointResult = "deleted" | "not_found";

/**
 * `DELETE /v1/merchants/:merchantId/webhook-endpoints/:id` business logic.
 * The statement carries the merchant-scoped predicate, never `id` alone. A hard
 * delete, not a status flip — `PATCH .../status: 'disabled'` (update.ts) is
 * the separate pause operation. Existing delivery foreign keys can reject
 * this delete; retention/deletion semantics require repair (B87).
 */
// FH: docblock says deliveries are kept and there's no ON DELETE CASCADE — then the FK blocks the DELETE and we 500?
export async function deleteWebhookEndpoint(
  pool: Pool,
  input: { merchantId: string; id: string },
): Promise<DeleteWebhookEndpointResult> {
  const result = await pool.query<{ id: string }>(
    `DELETE FROM webhook_endpoints WHERE id = $1 AND merchant_id = $2 RETURNING id`,
    [input.id, input.merchantId],
  );
  return result.rows[0] ? "deleted" : "not_found";
}
