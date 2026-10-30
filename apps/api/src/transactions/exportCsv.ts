import type { Pool } from "pg";
import { formatBhd, toFils } from "@filspay/money";
import type { TransactionRow } from "./serialize.js";

export interface TransactionsExportFilters {
  merchantId: string;
  from?: Date;
  to?: Date;
  status?: string[];
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(row: TransactionRow): string {
  return [
    row.id,
    row.status,
    formatBhd(toFils(Number(row.amount_fils))),
    formatBhd(toFils(Number(row.captured_fils))),
    csvEscape(row.reference ?? ""),
    row.occurred_at.toISOString(),
  ].join(",");
}

/** Builds the CSV body for `GET /v1/transactions/export`. */
export async function buildTransactionsExportCsv(
  pool: Pool,
  filters: TransactionsExportFilters,
): Promise<string> {
  const statusArray = filters.status && filters.status.length > 0 ? filters.status : null;
  const result = await pool.query<TransactionRow>(
    `SELECT * FROM transactions
      WHERE merchant_id = $1
        AND ($2::timestamptz IS NULL OR occurred_at >= $2)
        AND ($3::timestamptz IS NULL OR occurred_at <  $3)
        AND ($4::text[] IS NULL OR status = ANY($4))
      ORDER BY occurred_at ASC`,
    [filters.merchantId, filters.from ?? null, filters.to ?? null, statusArray],
  );

  const header = "id,status,amount_bhd,captured_bhd,reference,occurred_at";
  const lines = result.rows.map(toCsvRow);
  return [header, ...lines].join("\n");
}


/** Bounded pages in one snapshot; exact microseconds and ID form the cursor. */
export async function* transactionsExportChunks(pool: Pool, filters: TransactionsExportFilters): AsyncGenerator<string> {
 const client = await pool.connect();
 try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  yield "id,status,amount_bhd,captured_bhd,reference,occurred_at\n";
  let cursorTime: string | null = null;
  let cursorId: string | null = null;
  const status = filters.status?.length ? filters.status : null;
  for (;;) {
   const result: { rows: (TransactionRow & { cursor_time: string })[] } = await client.query<TransactionRow & { cursor_time: string }>(
    `SELECT *, occurred_at::text AS cursor_time FROM transactions
     WHERE merchant_id = $1
       AND ($2::timestamptz IS NULL OR occurred_at >= $2)
       AND ($3::timestamptz IS NULL OR occurred_at < $3)
       AND ($4::text[] IS NULL OR status = ANY($4))
       AND ($5::timestamptz IS NULL OR (occurred_at, id) > ($5, $6::uuid))
     ORDER BY occurred_at, id LIMIT 1000`,
    [filters.merchantId, filters.from ?? null, filters.to ?? null, status, cursorTime, cursorId]);
   for (const row of result.rows) yield toCsvRow(row) + "\n";
   if (result.rows.length < 1000) break;
   const last = result.rows[result.rows.length - 1]!;
   cursorTime = last.cursor_time;
   cursorId = last.id;
  }
  await client.query("COMMIT");
 } finally {
  let discard: Error | undefined;
  await client.query("ROLLBACK").catch((error: unknown) => { discard = error instanceof Error ? error : new Error(String(error)); });
  client.release(discard);
 }
}

export async function streamTransactionsExportCsv(
 pool: Pool, filters: TransactionsExportFilters, write: (chunk: string) => void | Promise<void>,
): Promise<void> {
 for await (const chunk of transactionsExportChunks(pool, filters)) await write(chunk);
}
