package metrics

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestRecordDailyPass_Failure(t *testing.T) {
	before := testutil.ToFloat64(dailyPasses.WithLabelValues("failure"))
	lastSuccess := testutil.ToFloat64(dailyPassLastSuccess)

	RecordDailyPass(time.Second, 3, 2, errors.New("two merchants failed"))

	if got := testutil.ToFloat64(dailyPasses.WithLabelValues("failure")); got != before+1 {
		t.Fatalf("failure count = %v, want %v", got, before+1)
	}
	if got := testutil.ToFloat64(dailyPassFailedMerchants); got != 2 {
		t.Fatalf("failed merchants = %v, want 2", got)
	}
	if got := testutil.ToFloat64(dailyPassLastSuccess); got != lastSuccess {
		t.Fatalf("a failed pass moved the last-success time from %v to %v", lastSuccess, got)
	}
}

func TestRecordDailyPass_SuccessClearsFailedMerchants(t *testing.T) {
	RecordDailyPass(time.Second, 3, 2, errors.New("two merchants failed"))
	RecordDailyPass(time.Second, 3, 0, nil)

	if got := testutil.ToFloat64(dailyPassFailedMerchants); got != 0 {
		t.Fatalf("failed merchants = %v, want 0", got)
	}
	if testutil.ToFloat64(dailyPassLastSuccess) == 0 {
		t.Fatal("a successful pass did not set the last-success time")
	}
}

func TestHandler_ServesOnlyMetrics(t *testing.T) {
	RecordDailyPass(time.Second, 1, 0, nil)

	recorder := httptest.NewRecorder()
	Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("/metrics status = %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "settlement_daily_passes_total") {
		t.Fatal("/metrics is missing settlement_daily_passes_total")
	}

	recorder = httptest.NewRecorder()
	Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("/ status = %d, want 404", recorder.Code)
	}
}
