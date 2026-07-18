import { describe, it, expect } from "vitest";
import {
  MIN_RADIUS_M, MAX_RADIUS_M, MAX_ZONES,
  clampRadius, validateZone, parseZoneRow, trackerStatusLine, trackerIsStale,
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
