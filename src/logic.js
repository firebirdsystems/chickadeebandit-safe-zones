// Pure zone helpers — no DOM, no fetch — so __tests__ can exercise them.

export const MIN_RADIUS_M = 150;   // iOS region monitoring is unreliable <100 m
export const MAX_RADIUS_M = 5000;
export const MAX_ZONES = 15;       // iOS caps an app at 20 OS regions; leave headroom

function strictNumber(value) {
  if (typeof value === "string" && value.trim() === "") return Number.NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function clampRadius(value) {
  const n = strictNumber(value);
  if (Number.isNaN(n)) return MIN_RADIUS_M;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(n)));
}

/** Validation for the zone editor. Returns a list of human-readable problems. */
export function validateZone(zone, existingCount, editingExisting) {
  const problems = [];
  if (!String(zone.name ?? "").trim()) problems.push("Give the zone a name.");
  const lat = strictNumber(zone.lat);
  const lng = strictNumber(zone.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    problems.push("Tap the map to place the zone.");
  }
  const radius = strictNumber(zone.radius_m);
  if (!Number.isFinite(radius) || radius < MIN_RADIUS_M || radius > MAX_RADIUS_M) {
    problems.push(`Radius must be between ${MIN_RADIUS_M} m and ${MAX_RADIUS_M / 1000} km.`);
  }
  if (!Array.isArray(zone.tracked_member_ids) || zone.tracked_member_ids.length === 0) {
    problems.push("Pick at least one member to track.");
  }
  if (!editingExisting && existingCount >= MAX_ZONES) {
    problems.push(`You can have at most ${MAX_ZONES} zones (phone OS limit).`);
  }
  return problems;
}

/** Parses a zone DB row (decrypted strings) into typed values, or null. */
export function parseZoneRow(row) {
  const lat = strictNumber(row.lat);
  const lng = strictNumber(row.lng);
  const radius = strictNumber(row.radius_m);
  if (
    !row.id
    || !Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lng) || lng < -180 || lng > 180
    || !Number.isFinite(radius) || radius < MIN_RADIUS_M || radius > MAX_RADIUS_M
  ) return null;
  let tracked = [];
  try {
    const parsed = JSON.parse(row.tracked_member_ids ?? "[]");
    if (Array.isArray(parsed)) tracked = parsed.map(String);
  } catch { /* tracks nobody */ }
  let audience = "adults";
  if (row.alert_audience && row.alert_audience !== "adults") {
    try {
      const parsed = JSON.parse(row.alert_audience);
      if (Array.isArray(parsed) && parsed.length > 0) audience = parsed.map(String);
    } catch { /* keep adults */ }
  }
  return {
    id: row.id,
    name: row.name ?? "",
    lat, lng, radiusM: radius,
    trackedMemberIds: tracked,
    alertAudience: audience,
    alertOnEnter: Number(row.alert_on_enter ?? 1) !== 0,
    alertOnExit: Number(row.alert_on_exit ?? 1) !== 0,
    active: Number(row.active ?? 1) !== 0,
    // Defaults false: a household with no home zone gets no ETA, which is the
    // intended state until an adult picks one.
    isHome: Number(row.is_home ?? 0) !== 0,
  };
}

/** "Dana's phone last reported 12 min ago" / "permission revoked" banner rows. */
export function trackerStatusLine(tracker, memberName, nowMs) {
  const name = memberName || "A member";
  if (tracker.permissionState === "denied" || tracker.permissionState === "granted_foreground") {
    return `${name}'s phone turned off background location — safe-zone alerts are paused.`;
  }
  const last = new Date(tracker.lastReportAt).getTime();
  if (Number.isNaN(last)) return `${name}'s phone hasn't reported yet.`;
  const mins = Math.max(0, Math.floor((nowMs - last) / 60000));
  if (mins < 1) return `${name}'s phone reported just now.`;
  if (mins < 60) return `${name}'s phone last reported ${mins} min ago.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${name}'s phone last reported ${hours} h ago.`;
  return `${name}'s phone last reported ${Math.floor(hours / 24)} d ago.`;
}

/** "🔋 12%" / "🔌 45%" for the banner, or "" when the device has never reported
 *  battery (older client build). Never renders 0% from a missing reading. */
export function trackerBatteryLabel(tracker) {
  const level = tracker.batteryLevel;
  if (typeof level !== "number" || !Number.isFinite(level)) return "";
  return `${tracker.batteryCharging ? "🔌" : "🔋"} ${Math.round(level)}%`;
}

export function trackerIsStale(tracker, nowMs, thresholdMs = 6 * 60 * 60 * 1000) {
  if (tracker.permissionState !== "granted_always") return true;
  const last = new Date(tracker.lastReportAt).getTime();
  return Number.isNaN(last) || nowMs - last >= thresholdMs;
}
