package config

import "testing"

func TestLoad_MetricsOffUnlessPortSet(t *testing.T) {
	withEnv(t, map[string]string{"DATABASE_URL": "postgres://a/db", "METRICS_PORT": ""})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.MetricsPort != 0 {
		t.Fatalf("expected metrics off by default, got port %d", cfg.MetricsPort)
	}

	t.Setenv("METRICS_PORT", "9464")
	cfg, err = Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.MetricsPort != 9464 {
		t.Fatalf("expected port 9464, got %d", cfg.MetricsPort)
	}
}
