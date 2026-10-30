import type { FastifyInstance } from "fastify";
import { toFils } from "@filspay/money";
import { requireMerchantAuth, requireMerchantRole, requireMerchantWriterActor } from "../auth/requireMerchantAuth.js";
import { initiateMerchantRefund } from "../refunds/initiateMerchantRefund.js";
import { BadRequestError } from "../lib/errors.js";

interface RefundBody { transactionId?: string; amountFils?: number; reason?: string }

/** Producer wiring is ready; the release gate stays off until the shared
 * safety/settlement/delivery/reporting verification is complete. */
export async function refundRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RefundBody }>("/", {
    preHandler: [requireMerchantAuth, requireMerchantRole("owner", "finance")],
  }, async (request, reply) => {
    if (!app.config.refundsReleaseEnabled) {
      return reply.code(501).send({ error: "not_implemented" });
    }
    const body = request.body;
    if (!body || typeof body.transactionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.transactionId) ||
      (body.reason !== undefined && typeof body.reason !== "string")) {
      throw new BadRequestError("invalid_request");
    }
    const header = request.headers["idempotency-key"];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) throw new BadRequestError("idempotency_key_required");
    let amountFils;
    try { amountFils = body.amountFils === undefined ? undefined : toFils(body.amountFils); }
    catch { throw new BadRequestError("invalid_amount"); }
    const result = await initiateMerchantRefund(app.db, app.acquirer, {
      merchantId: request.merchantAuth!.merchantId,
      transactionId: body.transactionId, amountFils, reason: body.reason,
      idempotencyKey: key, actor: requireMerchantWriterActor(request.merchantAuth!),
    });
    return reply.code(result.statusCode).send(result.body);
  });
}
