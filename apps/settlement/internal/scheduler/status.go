// Package scheduler — status.go. Lightweight operational logging only:
// estimates, for an operator tailing the daemon's logs, roughly when the
// next check-in will happen. This is informational — it has no bearing
// on runIfDue's actual decision (settlement.BusinessDayWindow, in
// internal/settlement/window.go, remains the sole authority on whether a
// business day has completed) — added purely so the daemon's own log
// output says something more useful than "checked, nothing due yet" on
// every tick.
package scheduler

import (
	"log"
	"time"
)

// schedulingLocation is the fixed Asia/Bahrain zone (UTC+3, no DST) used for
// the daemon's business dates and log estimates, independent of the process TZ.
func schedulingLocation() *time.Location { return time.FixedZone("Asia/Bahrain", 3*60*60) }

// estimateNextRunAt gives a rough, log-only estimate of the daemon's next
// check-in: the last check-in plus 24 hours, in schedulingLocation(). It
// is never consulted by runIfDue.
func estimateNextRunAt(lastCheckedAt time.Time) time.Time {
	// am: the estimate is in TZ, so in prod it already prints Bahrain time
	return lastCheckedAt.In(schedulingLocation()).Add(24 * time.Hour)
}

// logNextRunEstimate writes the estimate to the daemon's log, alongside
// the outcome of the check that just ran.
func logNextRunEstimate(lastCheckedAt time.Time) {
	log.Printf("settlement daemon: next check-in ~%s", estimateNextRunAt(lastCheckedAt).Format(time.RFC3339))
}
