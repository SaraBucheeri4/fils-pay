import type { PoolClient } from "pg";

/** Maintenance never promotes a sandbox merchant to live processing. */
export async function reconcileSandboxFlag(
  _client: PoolClient,
  _merchantId: string,
  _summary: { scanned: number; openAuthorizations: number },
): Promise<string[]> {
  return [];
}
