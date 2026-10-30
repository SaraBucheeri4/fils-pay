import type { Pool } from "pg";

export type DeleteWebhookEndpointResult = "deleted" | "not_found";

/**
 * `DELETE /v1/merchants/:merchantId/webhook-endpoints/:id` business logic.
 * The merchant-scoped update disables delivery while retaining the endpoint
 * and its restrictive history foreign keys, as required by ADR-0008.
 */
export async function deleteWebhookEndpoint(
  pool: Pool,
  input: { merchantId: string; id: string },
): Promise<DeleteWebhookEndpointResult> {
  const result = await pool.query<{ id: string }>(
    `UPDATE webhook_endpoints SET status = 'disabled', updated_at = now() WHERE id = $1 AND merchant_id = $2 RETURNING id`,
    [input.id, input.merchantId],
  );
  return result.rows[0] ? "deleted" : "not_found";
}
