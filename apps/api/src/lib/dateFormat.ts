const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;

/** A plain `YYYY-MM-DD` stamp for a log line — the Bahrain calendar date
 *  (ADR-0020). Not for anything a money calculation ever sees. */
export function formatIsoDate(date: Date): string {
  return new Date(date.getTime() + BAHRAIN_OFFSET_MS).toISOString().slice(0, 10);
}

/** The same instant written in Bahrain time with an explicit offset, for
 *  files a person reads (ADR-0020). */
export function formatBahrainInstant(date: Date): string {
  return new Date(date.getTime() + BAHRAIN_OFFSET_MS).toISOString().replace("Z", "+03:00");
}
