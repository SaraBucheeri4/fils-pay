import type { VolumePointDto } from "../../types.js";

/**
 * The figures behind the overview's quest widgets, all derived from the daily
 * volume points the API already returned. They are progress indicators only:
 * nothing here feeds a fee, a payout or a request back to the server.
 */

/** `date` plus `days`, on plain YYYY-MM-DD calendar dates. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function byDate(points: VolumePointDto[]): VolumePointDto[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date));
}

export function capturedTotalFils(points: VolumePointDto[]): number {
  return points.reduce((sum, point) => sum + point.capturedGrossFils, 0);
}

/** The window's last day with a row, or null for an empty window. */
export function latestPoint(points: VolumePointDto[]): VolumePointDto | null {
  return byDate(points).at(-1) ?? null;
}

/** The highest captured day. The earliest date wins a tie. */
export function bestDay(points: VolumePointDto[]): VolumePointDto | null {
  let best: VolumePointDto | null = null;
  for (const point of byDate(points)) {
    if (point.capturedGrossFils > 0 && (!best || point.capturedGrossFils > best.capturedGrossFils)) {
      best = point;
    }
  }
  return best;
}

/** Consecutive calendar days with a capture, ending on the window's last row. */
export function captureStreak(points: VolumePointDto[]): number {
  const sorted = byDate(points);
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i]!;
    if (point.capturedCount <= 0) break;
    if (streak > 0 && daysBetween(point.date, sorted[i + 1]!.date) !== 1) break;
    streak += 1;
  }
  return streak;
}

/** Calendar days since the last refund, counted back from the window's last
 *  row. With no refund in the window, the whole span of rows counts. */
export function refundFreeDays(points: VolumePointDto[]): number {
  const sorted = byDate(points);
  const last = sorted.at(-1);
  if (!last) return 0;
  const lastRefund = sorted.filter((point) => point.refundCount > 0).at(-1);
  return lastRefund ? daysBetween(lastRefund.date, last.date) : daysBetween(sorted[0]!.date, last.date) + 1;
}

/** Whole-number share for a meter, clamped to 0–100. Display only. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}
