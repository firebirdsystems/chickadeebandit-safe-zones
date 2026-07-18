-- Idempotent companion reports and durable delivery state. Existing rows were
-- already fully processed, so the backfill marks them delivered and uses their
-- bounded occurred_at as the server ordering/retention clock.
ALTER TABLE app_safe_zones__zone_events ADD COLUMN report_id TEXT;
ALTER TABLE app_safe_zones__zone_events ADD COLUMN device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE app_safe_zones__zone_events ADD COLUMN received_at TEXT;
ALTER TABLE app_safe_zones__zone_events ADD COLUMN classification TEXT NOT NULL DEFAULT 'record_silent';
ALTER TABLE app_safe_zones__zone_events ADD COLUMN alert_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_safe_zones__zone_events ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'delivered';

UPDATE app_safe_zones__zone_events
SET received_at = occurred_at
WHERE received_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_safe_zones__zone_events_report_idx
  ON app_safe_zones__zone_events (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS app_safe_zones__zone_events_received_idx
  ON app_safe_zones__zone_events (received_at);
