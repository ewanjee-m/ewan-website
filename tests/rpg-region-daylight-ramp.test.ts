import { Color } from "three";
import { describe, expect, it } from "vitest";
import {
  createRpgRegionPresentation,
  resolveRpgRegionPresentation,
  RPG_REGION_PRESENTATION_PROFILES
} from "../app/world/RpgRegionPresentation";
import type { NavigationRegion } from "../app/world/RpgWorldGeometry";

const ROUTE_ORDER = [
  "airport",
  "tokyo",
  "gyukatsu",
  "sakura",
  "hanabi"
] as const;

const luminance = (hex: string) => {
  const color = new Color(hex);
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
};

const zone = (displayZoneId: (typeof ROUTE_ORDER)[number]): NavigationRegion => ({
  kind: "zone",
  regionId: displayZoneId,
  displayZoneId,
  highlightedZoneIds: [displayZoneId]
});

const transition = (
  fromZoneId: (typeof ROUTE_ORDER)[number],
  toZoneId: (typeof ROUTE_ORDER)[number],
  progress: number
): NavigationRegion => ({
  kind: "transition",
  regionId: `${fromZoneId}-to-${toZoneId}`,
  transitionId: `${fromZoneId}-to-${toZoneId}`,
  fromZoneId,
  toZoneId,
  progress,
  displayZoneId: progress < 0.5 ? fromZoneId : toZoneId,
  highlightedZoneIds: [fromZoneId, toZoneId]
});

describe("RPG zone daylight ramp", () => {
  it("walks the route from morning brightness down into night", () => {
    const skyLuminance = ROUTE_ORDER.map((zoneId) =>
      luminance(RPG_REGION_PRESENTATION_PROFILES[zoneId].sky)
    );

    for (let index = 2; index < skyLuminance.length; index += 1) {
      expect(
        skyLuminance[index],
        `${ROUTE_ORDER[index]} darker than ${ROUTE_ORDER[index - 1]}`
      ).toBeLessThan(skyLuminance[index - 1]);
    }
    // Tokyo is the midday peak, so it may sit at or above the airport morning.
    expect(skyLuminance[1]).toBeGreaterThan(skyLuminance[2]);
    // Night is unmistakably night.
    expect(skyLuminance[4]).toBeLessThan(skyLuminance[0] * 0.35);
  });

  it("drops the sun and dims the key as the route runs late", () => {
    const keyIntensity = ROUTE_ORDER.map(
      (zoneId) => RPG_REGION_PRESENTATION_PROFILES[zoneId].keyIntensity
    );
    const elevation = ROUTE_ORDER.map(
      (zoneId) => RPG_REGION_PRESENTATION_PROFILES[zoneId].sunElevationDegrees
    );
    const azimuth = ROUTE_ORDER.map(
      (zoneId) => RPG_REGION_PRESENTATION_PROFILES[zoneId].sunAzimuthDegrees
    );

    expect(keyIntensity[1]).toBeGreaterThan(keyIntensity[0]);
    for (let index = 2; index < keyIntensity.length; index += 1) {
      expect(keyIntensity[index]).toBeLessThan(keyIntensity[index - 1]);
    }
    for (let index = 2; index < 4; index += 1) {
      expect(elevation[index]).toBeLessThan(elevation[index - 1]);
    }
    // The azimuth sweeps one way so a plain lerp never swings the sun back
    // through the origin between zones.
    for (let index = 1; index < azimuth.length; index += 1) {
      expect(azimuth[index]).toBeGreaterThan(azimuth[index - 1]);
    }
  });

  it("keeps the fog colour identical to the sky in every zone", () => {
    for (const zoneId of ROUTE_ORDER) {
      const profile = RPG_REGION_PRESENTATION_PROFILES[zoneId];
      expect(profile.fog, zoneId).toBe(profile.sky);
      expect(
        luminance(profile.skyTop),
        `${zoneId} zenith darker than horizon`
      ).toBeLessThan(luminance(profile.sky));
    }
  });

  it("keeps fog readable inside the walked near field", () => {
    for (const zoneId of ROUTE_ORDER) {
      const profile = RPG_REGION_PRESENTATION_PROFILES[zoneId];
      // The chase camera boom bottoms out at 2.6 units; fog has to start well
      // inside the 72 unit playable square to give the near field any depth.
      expect(profile.fogNear, `${zoneId}:near`).toBeGreaterThan(2.6);
      expect(profile.fogNear, `${zoneId}:near`).toBeLessThanOrEqual(20);
      // The perimeter skyline ring reaches roughly 79 units at the corners.
      expect(profile.fogFar, `${zoneId}:far`).toBeGreaterThanOrEqual(60);
      expect(profile.fogFar, `${zoneId}:far`).toBeLessThanOrEqual(100);
      expect(profile.fogFar - profile.fogNear).toBeGreaterThan(40);
    }
  });

  it("interpolates the new sky, sun and fog channels through a transition", () => {
    const target = createRpgRegionPresentation();
    const from = RPG_REGION_PRESENTATION_PROFILES.sakura;
    const to = RPG_REGION_PRESENTATION_PROFILES.hanabi;

    resolveRpgRegionPresentation(zone("sakura"), target);
    expect(target.skyTop.getHexString()).toBe(from.skyTop.slice(1));
    expect(target.sunElevationDegrees).toBe(from.sunElevationDegrees);
    expect(target.fogFar).toBe(from.fogFar);

    resolveRpgRegionPresentation(transition("sakura", "hanabi", 0.5), target);
    expect(target.skyTop.getHexString()).toBe(
      new Color(from.skyTop).lerp(new Color(to.skyTop), 0.5).getHexString()
    );
    expect(target.bounce.getHexString()).toBe(
      new Color(from.bounce).lerp(new Color(to.bounce), 0.5).getHexString()
    );
    expect(target.sunElevationDegrees).toBeCloseTo(
      (from.sunElevationDegrees + to.sunElevationDegrees) / 2
    );
    expect(target.sunAzimuthDegrees).toBeCloseTo(
      (from.sunAzimuthDegrees + to.sunAzimuthDegrees) / 2
    );
    expect(target.fogNear).toBeCloseTo((from.fogNear + to.fogNear) / 2);
    expect(target.fogFar).toBeCloseTo((from.fogFar + to.fogFar) / 2);

    resolveRpgRegionPresentation(zone("hanabi"), target);
    expect(target.ambient.getHexString()).toBe(to.ambient.slice(1));
    expect(target.rim.getHexString()).toBe(to.rim.slice(1));
  });
});
