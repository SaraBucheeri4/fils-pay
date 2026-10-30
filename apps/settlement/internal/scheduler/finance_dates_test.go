package scheduler

import (
	"testing"
	"time"
)

func TestFinanceUsesBahrainBusinessDateAcrossUTCMonth(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-03-31T21:15:00Z")
	date, due := completedBusinessDay(now, 15)
	if !due || date.Format("2006-01-02") != "2026-03-31" {
		t.Fatalf("date=%s due=%v", date, due)
	}
	if _, due := completedBusinessDay(now.Add(-time.Second), 15); due {
		t.Fatal("ran before local grace period")
	}
}

func TestFinanceNightlyRefreshIsDueAtTwoBahrain(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-03-31T23:00:00Z")
	date, due := nightlyRefreshDate(now, "")
	if date != "2026-04-01" || !due {
		t.Fatalf("date=%s due=%v", date, due)
	}
	if _, due := nightlyRefreshDate(now.Add(-time.Second), ""); due {
		t.Fatal("ran before 02:00")
	}
	if _, due := nightlyRefreshDate(now, date); due {
		t.Fatal("repeated successful refresh")
	}
}
