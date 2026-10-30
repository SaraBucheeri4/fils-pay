// Package metrics exposes the daemon's daily batching pass to Prometheus. It
// records counts and timings only, never amounts or merchant IDs, and has no
// part in any settlement calculation.
//
// The daemon attempts the latest business day on every poll and relies on
// idempotency, so one "pass" is one attempt, not one day. Runs started from
// the CLI or the admin plane are not counted here.
package metrics

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const shutdownTimeout = 5 * time.Second

var (
	dailyPasses = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "settlement_daily_passes_total",
		Help: "Daily batching passes by result: success or failure.",
	}, []string{"result"})
	dailyPassDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "settlement_daily_pass_duration_seconds",
		Help:    "How long a daily batching pass took.",
		Buckets: []float64{0.1, 0.5, 1, 5, 15, 60, 300, 900},
	})
	dailyPassMerchants = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "settlement_daily_pass_merchants",
		Help: "Merchants processed by the latest pass.",
	})
	dailyPassFailedMerchants = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "settlement_daily_pass_failed_merchants",
		Help: "Merchants that failed in the latest pass.",
	})
	dailyPassLastSuccess = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "settlement_daily_pass_last_success_timestamp_seconds",
		Help: "When a pass last finished without an error.",
	})
)

// RecordDailyPass records the outcome of one settlement.RunDailyBatch call.
func RecordDailyPass(duration time.Duration, merchants, failedMerchants int, err error) {
	dailyPassDuration.Observe(duration.Seconds())
	dailyPassMerchants.Set(float64(merchants))
	dailyPassFailedMerchants.Set(float64(failedMerchants))
	if err != nil {
		dailyPasses.WithLabelValues("failure").Inc()
		return
	}
	dailyPasses.WithLabelValues("success").Inc()
	dailyPassLastSuccess.SetToCurrentTime()
}

// Handler serves /metrics and nothing else.
func Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /metrics", promhttp.Handler())
	return mux
}

// Serve blocks until ctx is cancelled. The port is separate from the internal
// API so scraping needs no bearer token.
func Serve(ctx context.Context, port int) error {
	addr := fmt.Sprintf(":%d", port)
	server := &http.Server{Addr: addr, Handler: Handler(), ReadHeaderTimeout: 10 * time.Second}

	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("settlement metrics: graceful shutdown: %v", err)
		}
	}()

	log.Printf("settlement metrics: listening on %s", addr)
	err := server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		<-shutdownDone
		return nil
	}
	return fmt.Errorf("metrics: listen on %s: %w", addr, err)
}
