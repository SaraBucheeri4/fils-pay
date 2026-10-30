#!/usr/bin/env -S npx tsx
/** Inspect March export-line residue. --apply is a separately scoped historical repair. */
import { pathToFileURL } from "node:url";
import { Client } from "pg";

export function monthBounds(year: number, month: number): { start: Date; end: Date } {
 return { start: new Date(Date.UTC(year, month - 1, 1, -3)), end: new Date(Date.UTC(year, month, 1, -3)) };
}

export interface ResidueRow { merchantId: string; capturedFils: number }
export function computeResidueFils(capturedFils: number): number { return capturedFils % 10; }

export async function reconcileMarch(client: Client, apply = false): Promise<number> {
 const { start, end } = monthBounds(2026, 3);
 await client.query("BEGIN");
 try {
  // An old merchant-level sweep cannot safely be attributed to individual
  // lines. Require a separately reviewed repair plan instead of double posting.
  const legacy = await client.query(`SELECT 1 FROM ledger_entries
   WHERE description ILIKE '%March 2026%residue%sweep%' LIMIT 1`);
  if (apply && legacy.rowCount) throw new Error("Legacy March sweep exists; review historical postings before applying");
  const result = await client.query<{ id: string; gross_fils: string; amount_fils: string }>(
   `SELECT sel.id, COALESCE(sel.gross_fils, captures.gross_fils)::text AS gross_fils,
           sel.amount_fils::text
    FROM scheme_export_lines sel
    JOIN settlement_batches sb ON sb.id = sel.settlement_batch_id
    LEFT JOIN LATERAL (
      SELECT SUM(te.amount_fils) AS gross_fils FROM transaction_events te
       WHERE te.transaction_id = sel.transaction_id AND te.settlement_batch_id = sel.settlement_batch_id
         AND te.event_type IN ('captured', 'partially_captured')
    ) captures ON true
    WHERE sb.batch_date >= ($1::timestamptz AT TIME ZONE 'Asia/Bahrain')::date
      AND sb.batch_date < ($2::timestamptz AT TIME ZONE 'Asia/Bahrain')::date
      AND NOT EXISTS (SELECT 1 FROM scheme_residue_postings p WHERE p.scheme_export_line_id = sel.id)
    ORDER BY sel.id FOR UPDATE OF sel`, [start, end]);
  let total = 0n;
  for (const line of result.rows) {
   if (line.gross_fils == null) throw new Error(`Missing authoritative gross for scheme line ${line.id}`);
   const residue = BigInt(line.gross_fils) - BigInt(line.amount_fils);
   if (residue < 0n || residue > 9n) throw new Error(`Invalid residue for scheme line ${line.id}`);
   total += residue;
   // Uses the same unique per-line receipt and balanced clearing-credit /
   // rounding-debit posting function as automatic exports. All or nothing.
   if (apply) await client.query("SELECT post_scheme_line_residue($1, $2::bigint)", [line.id, line.gross_fils]);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Residue total exceeds safe output range");
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  return Number(total);
 } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function main(): Promise<void> {
 if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
 const client = new Client({ connectionString: process.env.DATABASE_URL });
 await client.connect();
 try {
  const apply = process.argv.includes("--apply");
  const total = await reconcileMarch(client, apply);
  console.log(`${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bahrain' })} Bahrain: ${apply ? 'posted' : 'dry run'} residue ${total} fils`);
 } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
