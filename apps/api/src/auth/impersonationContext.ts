import type { FastifyRequest } from "fastify";
import { lookupImpersonationGrant } from "../admin/impersonation.js";
import { ForbiddenError } from "../lib/errors.js";

/** A live view-as grant takes precedence over other merchant credentials. */
export async function resolveRequestImpersonation(request: FastifyRequest) {
  const token = request.cookies[request.server.config.impersonationCookieName];
  if (!token) return null;
  const grant = await lookupImpersonationGrant(request.server.db, token);
  if (grant && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    throw new ForbiddenError("forbidden", "Impersonation is read-only");
  }
  return grant;
}
