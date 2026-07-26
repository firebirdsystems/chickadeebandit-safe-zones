import { describe, it, expect } from "vitest";
import {
  MIN_RADIUS_M, MAX_RADIUS_M, MAX_ZONES,
  clampRadius, validateZone, parseZoneRow, trackerStatusLine, trackerIsStale, trackerBatteryLabel,
  buildGeocodeUrl, parseGeocodeResults, zoneNameFromResult, MAX_GEOCODE_RESULTS,
  presenceSummary,
} from "../src/logic.js";

describe("clampRadius", () => {
  it("clamps below the iOS-reliable floor", () => {
    expect(clampRadius(10)).toBe(MIN_RADIUS_M);
  });
  it("clamps above the max", () => {
    expect(clampRadius(999999)).toBe(MAX_RADIUS_M);
  });
  it("rounds and passes through sane values", () => {
    expect(clampRadius("300.4")).toBe(300);
  });
  it("falls back to the floor on junk", () => {
    expect(clampRadius("abc")).toBe(MIN_RADIUS_M);
    expect(clampRadius("300m")).toBe(MIN_RADIUS_M);
    expect(clampRadius(Infinity)).toBe(MIN_RADIUS_M);
  });
});

describe("validateZone", () => {
  const good = { name: "School", lat: "40.1", lng: "-75.2", radius_m: "300", tracked_member_ids: ["m1"] };

  it("accepts a complete zone", () => {
    expect(validateZone(good, 0, false)).toEqual([]);
  });
  it("requires a name, a spot, a sane radius, and a tracked member", () => {
    expect(validateZone({ ...good, name: " " }, 0, false)).toHaveLength(1);
    expect(validateZone({ ...good, lat: "" }, 0, false)).toHaveLength(1);
    expect(validateZone({ ...good, lat: "91" }, 0, false)).toHaveLength(1);
    expect(validateZone({ ...good, lat: "40north" }, 0, false)).toHaveLength(1);
    expect(validateZone({ ...good, radius_m: "50" }, 0, false)).toHaveLength(1);
    expect(validateZone({ ...good, radius_m: "9000" }, 0, false)).toHaveLength(1);
    expect(validateZone({ ...good, tracked_member_ids: [] }, 0, false)).toHaveLength(1);
  });
  it("caps new zones at MAX_ZONES but allows editing an existing one", () => {
    expect(validateZone(good, MAX_ZONES, false)).toHaveLength(1);
    expect(validateZone(good, MAX_ZONES, true)).toEqual([]);
  });
});

describe("parseZoneRow", () => {
  it("parses a decrypted DB row", () => {
    const zone = parseZoneRow({
      id: "z1", name: "School", lat: "40.1", lng: "-75.2", radius_m: "300",
      tracked_member_ids: '["m1","m2"]', alert_audience: "adults",
      alert_on_enter: 1, alert_on_exit: 0, active: 1,
    });
    expect(zone).toMatchObject({
      id: "z1", lat: 40.1, lng: -75.2, radiusM: 300,
      trackedMemberIds: ["m1", "m2"], alertAudience: "adults",
      alertOnEnter: true, alertOnExit: false, active: true,
    });
  });
  it("parses a member-array audience", () => {
    const zone = parseZoneRow({
      id: "z1", name: "S", lat: "1", lng: "2", radius_m: "300",
      tracked_member_ids: "[]", alert_audience: '["m3"]',
    });
    expect(zone.alertAudience).toEqual(["m3"]);
  });
  it("returns null for rows missing geometry", () => {
    expect(parseZoneRow({ id: "z1", lat: "x", lng: "1", radius_m: "300" })).toBeNull();
    expect(parseZoneRow({ id: "", lat: "1", lng: "1", radius_m: "300" })).toBeNull();
    expect(parseZoneRow({ id: "z1", lat: "91", lng: "1", radius_m: "300" })).toBeNull();
    expect(parseZoneRow({ id: "z1", lat: "1", lng: "1", radius_m: "300m" })).toBeNull();
  });
  it("treats malformed tracked_member_ids as tracking nobody", () => {
    const zone = parseZoneRow({ id: "z1", lat: "1", lng: "2", radius_m: "300", tracked_member_ids: "{oops" });
    expect(zone.trackedMemberIds).toEqual([]);
  });
});

describe("tracker status", () => {
  const now = Date.parse("2026-07-18T12:00:00Z");
  const fresh = { permissionState: "granted_always", lastReportAt: "2026-07-18T11:48:00Z" };

  it("reports minutes ago for a healthy tracker", () => {
    expect(trackerStatusLine(fresh, "Dana", now)).toBe("Dana's phone last reported 12 min ago.");
    expect(trackerIsStale(fresh, now)).toBe(false);
  });
  it("flags revoked permission regardless of recency", () => {
    const revoked = { ...fresh, permissionState: "granted_foreground" };
    expect(trackerStatusLine(revoked, "Dana", now)).toMatch(/background location/);
    expect(trackerIsStale(revoked, now)).toBe(true);
  });
  it("goes stale after six hours of silence", () => {
    const silent = { ...fresh, lastReportAt: "2026-07-18T05:00:00Z" };
    expect(trackerIsStale(silent, now)).toBe(true);
  });
});

describe("trackerBatteryLabel", () => {
  it("shows a battery icon and rounded percentage", () => {
    expect(trackerBatteryLabel({ batteryLevel: 42.4 })).toBe("🔋 42%");
  });
  it("shows a plug icon while charging", () => {
    expect(trackerBatteryLabel({ batteryLevel: 80, batteryCharging: true })).toBe("🔌 80%");
  });
  it("renders nothing when the device has never reported battery", () => {
    // Must not read as 0% — an older client build, not a dead phone.
    expect(trackerBatteryLabel({})).toBe("");
    expect(trackerBatteryLabel({ batteryLevel: null })).toBe("");
  });
});

describe("buildGeocodeUrl", () => {
  it("builds an escaped Nominatim search URL", () => {
    const url = new URL(buildGeocodeUrl(" 123 Main St, Springfield "));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("123 Main St, Springfield");
    expect(url.searchParams.get("limit")).toBe(String(MAX_GEOCODE_RESULTS));
  });
  it("refuses queries too short to be worth a lookup", () => {
    expect(buildGeocodeUrl("")).toBe("");
    expect(buildGeocodeUrl("  a ")).toBe("");
    expect(buildGeocodeUrl(null)).toBe("");
  });
});

describe("parseGeocodeResults", () => {
  const hit = { lat: "40.7128", lon: "-74.0060", display_name: "New York, NY, USA" };

  it("normalizes results to label/lat/lng", () => {
    expect(parseGeocodeResults([hit])).toEqual([{ label: "New York, NY, USA", lat: 40.7128, lng: -74.006 }]);
  });
  it("drops entries the zone editor could never store", () => {
    expect(parseGeocodeResults([
      { ...hit, lat: "91" },
      { ...hit, lon: "abc" },
      { ...hit, display_name: "  " },
    ])).toEqual([]);
  });
  it("caps the list and tolerates junk payloads", () => {
    const many = Array.from({ length: 20 }, () => hit);
    expect(parseGeocodeResults(many)).toHaveLength(MAX_GEOCODE_RESULTS);
    expect(parseGeocodeResults(null)).toEqual([]);
    expect(parseGeocodeResults({ error: "rate limited" })).toEqual([]);
  });
});

describe("zoneNameFromResult", () => {
  it("suggests the most specific part of the address", () => {
    expect(zoneNameFromResult({ label: "Lincoln Elementary School, 5th Ave, Springfield" }))
      .toBe("Lincoln Elementary School");
  });
  it("stays inside the name column's 60-character limit", () => {
    expect(zoneNameFromResult({ label: "x".repeat(200) })).toHaveLength(60);
    expect(zoneNameFromResult({})).toBe("");
  });
});

describe("parseZoneRow home flag", () => {
  const base = {
    id: "z1", name: "Home", lat: "40", lng: "-74", radius_m: "300",
    tracked_member_ids: "[]", alert_audience: "adults",
  };
  it("defaults isHome to false so no ETA is shown until an adult picks one", () => {
    expect(parseZoneRow(base).isHome).toBe(false);
  });
  it("reads the is_home flag", () => {
    expect(parseZoneRow({ ...base, is_home: 1 }).isHome).toBe(true);
  });
});

describe("presenceSummary", () => {
  const nameOf = (id) => ({ m1: "Emma", m2: "Dana", m3: "Sam" })[id] ?? "Unknown";
  const home = { id: "z1", name: "Home", isHome: true };
  const school = { id: "z2", name: "School", isHome: false };
  const board = [
    { memberId: "m1", state: "home", since: "2026-07-25T07:00:00.000Z" },
    { memberId: "m2", state: "away", since: "2026-07-25T08:00:00.000Z" },
    { memberId: "m3", state: "unknown", since: null },
  ];

  it("groups the board by state for the home zone", () => {
    expect(presenceSummary(home, board, nameOf)).toEqual({
      home: ["Emma"], away: ["Dana"], unknown: ["Sam"],
    });
  });

  it("shows nothing on a zone that is not home", () => {
    // Presence is anchored to the home boundary hub-side; on "School" it would lie.
    expect(presenceSummary(school, board, nameOf)).toBeNull();
  });

  it("shows nothing when the hub returns an empty board", () => {
    // Location switched off, no home zone, or nobody enrolled.
    expect(presenceSummary(home, [], nameOf)).toBeNull();
    expect(presenceSummary(home, null, nameOf)).toBeNull();
  });

  it("skips malformed entries instead of throwing", () => {
    expect(presenceSummary(home, [null, "junk", { memberId: "m1", state: "home" }], nameOf))
      .toEqual({ home: ["Emma"], away: [], unknown: [] });
  });

  it("treats an unrecognized state as unknown rather than home", () => {
    expect(presenceSummary(home, [{ memberId: "m1", state: "nonsense" }], nameOf))
      .toEqual({ home: [], away: [], unknown: ["Emma"] });
  });
});
