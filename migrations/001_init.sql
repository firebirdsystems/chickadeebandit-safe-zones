-- Safe Zones — geofenced areas and the crossing history the hub records.
--
-- `zones` is adult-managed configuration through the trusted Hub geofence
-- endpoint (endpoint_only + max_rows policy): the map
-- circle, which members it tracks (JSON array of member ids), who gets the
-- alert, and enter/exit toggles. Only adults can read the list (read "adult")
-- — zone geometry is home/school coordinates; a tracked member's own phone
-- still gets its zones via the trusted /api/geofence/zones route. Text columns
-- are encrypted by the hub's default app-DB encryption (no db_encryption:"off")
-- — zone names and coordinates are sensitive. lat/lng/radius are stored as
-- TEXT so they round-trip the encryption layer; the hub and the UI parseFloat
-- on read.
--
-- `zone_events` is owner_only (member_id) with endpoint_writes_only: ONLY the
-- hub's /api/geofence/event pipeline writes rows (app-originated SQL cannot
-- edit history); adults read everyone's 30-day history, a tracked member reads
-- their own, siblings/guests see nothing (retain_days prunes older rows).
-- No coordinates are ever stored on events — the zone IS the location.
-- `label` is the precomputed "Emma arrived at School" line so the native
-- glance can render one decrypted column.
CREATE TABLE IF NOT EXISTS app_safe_zones__zones (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  lat                TEXT NOT NULL,
  lng                TEXT NOT NULL,
  radius_m           TEXT NOT NULL,
  tracked_member_ids TEXT NOT NULL DEFAULT '[]',
  alert_audience     TEXT NOT NULL DEFAULT 'adults',
  alert_on_enter     INTEGER NOT NULL DEFAULT 1,
  alert_on_exit      INTEGER NOT NULL DEFAULT 1,
  active             INTEGER NOT NULL DEFAULT 1,
  created_by         TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_safe_zones__zone_events (
  id          TEXT PRIMARY KEY,
  zone_id     TEXT NOT NULL,
  zone_name   TEXT NOT NULL DEFAULT '',
  member_id   TEXT NOT NULL,
  member_name TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  alerted     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS app_safe_zones__zone_events_zone_idx
  ON app_safe_zones__zone_events (zone_id, member_id, occurred_at);

-- retain_days pruning scans by timestamp; the retention contract requires an
-- index whose leading column is the legacy timestamp column. Migration 002
-- moves retention to the server-derived received_at clock.
CREATE INDEX IF NOT EXISTS app_safe_zones__zone_events_occurred_idx
  ON app_safe_zones__zone_events (occurred_at);
