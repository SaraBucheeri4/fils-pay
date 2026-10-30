import type { Pool } from "pg";
import { insertAdminAuditLog } from "../adminAudit/log.js";
import { withTransaction } from "../db/withTransaction.js";
import { ConflictError } from "../lib/errors.js";
import { recordKycReviewInTx } from "../onboarding/review.js";

export interface BulkApproveMerchantsKycInput {
  merchantIds: string[];
  adminUserId: string;
  notes?: string;
}

/**
 * @property approvedMerchantIds IDs atomically approved with individual review evidence.
 */
export interface BulkApproveMerchantsKycResult {
  approvedCount: number;
  approvedMerchantIds: string[];
}

/** Approves the given merchants and audits it. */
export async function bulkApproveMerchantsKyc(
  pool: Pool,
  input: BulkApproveMerchantsKycInput,
): Promise<BulkApproveMerchantsKycResult> {
  return withTransaction(pool, async (client) => {
    const ids = [...new Set(input.merchantIds)].sort();
    const result = await client.query<{ id: string; onboarding_status: string }>(
      `SELECT id, onboarding_status FROM merchants WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [ids],
    );
    if (result.rows.length !== ids.length || result.rows.some((row) => row.onboarding_status !== "under_review")) {
      throw new ConflictError("invalid_kyc_transition", "Every selected merchant must be under_review");
    }
    const admin = await client.query<{ email: string }>(`SELECT email FROM admin_users WHERE id = $1 AND status = 'active'`, [input.adminUserId]);
    if (!admin.rows[0]) throw new ConflictError("invalid_reviewer");
    for (const row of result.rows) {
      await recordKycReviewInTx(client, {
        merchantId: row.id, outcome: "approved", reviewerIdentifier: admin.rows[0].email,
        reviewerAdminUserId: input.adminUserId, notes: input.notes,
      });
      await insertAdminAuditLog(client, {
        adminUserId: input.adminUserId, action: "kyc_review", targetType: "merchant", targetId: row.id,
        metadata: { from: "under_review", to: "approved", bulk: true, notes: input.notes ?? null },
      });
    }
    const approvedMerchantIds = result.rows.map((row) => row.id);

    await insertAdminAuditLog(client, {
      adminUserId: input.adminUserId,
      action: "kyc_bulk_approve",
      targetType: "platform",
      targetId: null,
      metadata: {
        requestedMerchantIds: input.merchantIds,
        approvedMerchantIds,
        notes: input.notes ?? null,
      },
    });

    return { approvedCount: approvedMerchantIds.length, approvedMerchantIds };
  });
}
