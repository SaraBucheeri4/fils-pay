/** ADR-0007: the console presents every instant in Asia/Bahrain (UTC+3, no
 *  DST), whatever timezone the browser is in. */
const BAHRAIN = { timeZone: "Asia/Bahrain" } as const;
const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", BAHRAIN);
}

export function dateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", BAHRAIN);
}

export function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", BAHRAIN);
}

/** The most recently completed Bahrain business date, as YYYY-MM-DD. */
export function completedBahrainDate(nowMs: number = Date.now()): string {
  return new Date(nowMs + BAHRAIN_OFFSET_MS - DAY_MS).toISOString().slice(0, 10);
}
