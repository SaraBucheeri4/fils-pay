ALTER TABLE platform_stats ALTER COLUMN total_processed_fils TYPE BIGINT;
-- Preserve existing approximate values; do not infer or repair historical drift.
ALTER TABLE merchants ALTER COLUMN lifetime_net_payout_monitoring_estimate TYPE BIGINT
  USING round(lifetime_net_payout_monitoring_estimate::numeric)::bigint;
