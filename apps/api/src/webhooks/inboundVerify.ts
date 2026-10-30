import { createHash, createHmac } from "node:crypto";
import { timingSafeEqualHex } from "../lib/crypto.js";

/** Verifies the signature on an inbound acquirer callback. */

interface ParsedAcquirerSignatureHeader {
  timestamp: number;
  signature: string;
}

function parseAcquirerSignatureHeader(header: string): ParsedAcquirerSignatureHeader | null {
  let timestampStr: string | null = null;
  let signature: string | null = null;

  for (const part of header.split(",")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key === "t") timestampStr = value;
    else if (key === "v1") signature = value;
  }

  if (!timestampStr || !signature) return null;
  if (!/^\d+$/.test(timestampStr)) return null;

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) return null;

  return { timestamp, signature };
}

/** Authentication and freshness failures are distinguished for diagnostics. */
export type VerifyAcquirerCallbackFailureReason = "malformed_header" | "signature_mismatch" | "timestamp_out_of_tolerance";

export interface VerifyAcquirerCallbackResult {
  valid: boolean;
  reason?: VerifyAcquirerCallbackFailureReason;
}

function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqualHex(a, b);
}

/** Requires a current signature. HTTP callers pass exact body bytes (ADR-0019).
 * Object input remains a convenience for callers signing JSON.stringify output;
 * it is never substituted for the HTTP route's captured bytes. */
export function verifyAcquirerCallbackSignature(
  payload: unknown,
  header: string | undefined,
  secret: string,
  _requireSignature = true,
): VerifyAcquirerCallbackResult {
  // This value was committed publicly; never accept it again, including after rollback.
  const retired = "63889b3971febcfcdfe8d4bc9a17e67b719c00e47b2c1fc74eb7aa8a50ec6306";
  if (!header || !secret || createHash("sha256").update(secret).digest("hex") === retired) {
    return { valid: false, reason: "malformed_header" };
  }

  const parsed = parseAcquirerSignatureHeader(header);
  if (!parsed) return { valid: false, reason: "malformed_header" };

  const signedBody = Buffer.isBuffer(payload) || typeof payload === "string" ? payload : JSON.stringify(payload);
  if (signedBody === undefined) return { valid: false, reason: "signature_mismatch" };
  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.`)
    .update(signedBody)
    .digest("hex");

  if (!constantTimeEquals(expected, parsed.signature)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  if (!Number.isSafeInteger(parsed.timestamp) || Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp) > 300) {
    return { valid: false, reason: "timestamp_out_of_tolerance" };
  }

  return { valid: true };
}
