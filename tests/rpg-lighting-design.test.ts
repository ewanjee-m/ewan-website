import { describe, expect, it } from "vitest";
import {
  getRpgKeyLightPosition,
  resolveRpgKeyLightPlacement,
  resolveRpgRimLightPosition,
  RPG_AMBIENT_LIGHT_INTENSITY,
  RPG_KEY_LIGHT_DISTANCE,
  RPG_KEY_LIGHT_MAX_ELEVATION_DEGREES,
  RPG_KEY_LIGHT_MIN_ELEVATION_DEGREES,
  RPG_KEY_SHADOW_EXTENT,
  RPG_KEY_SHADOW_FAR,
  RPG_KEY_SHADOW_NORMAL_BIAS,
  RPG_RIM_LIGHT_INTENSITY,
  RPG_SKY_DOME_RADIUS,
  RPG_TONE_MAPPING_EXPOSURE
} from "../app/world/RpgLightingDesign";
import { RPG_REGION_PRESENTATION_PROFILES } from "../app/world/RpgRegionPresentation";

const ZONE_IDS = Object.keys(RPG_REGION_PRESENTATION_PROFILES) as (
  keyof typeof RPG_REGION_PRESENTATION_PROFILES
)[];

describe("RPG lighting design", () => {
  it("keeps a lit ambient and rim floor so no facade renders black", () => {
    expect(RPG_AMBIENT_LIGHT_INTENSITY).toBeGreaterThanOrEqual(0.84);
    expect(RPG_RIM_LIGHT_INTENSITY).toBeGreaterThanOrEqual(0.4);
    expect(RPG_TONE_MAPPING_EXPOSURE).toBeGreaterThanOrEqual(1.16);
  });

  it("holds the key light inside the band where vertical facades stay lit", () => {
    // A wall normal is horizontal, so N.L on a sun-facing facade is
    // cos(elevation). The old 74 degree key gave 0.19; the band floor gives
    // at least 0.71.
    expect(RPG_KEY_LIGHT_MIN_ELEVATION_DEGREES).toBeGreaterThanOrEqual(12);
    expect(RPG_KEY_LIGHT_MAX_ELEVATION_DEGREES).toBeLessThanOrEqual(45);
    expect(
      Math.cos((RPG_KEY_LIGHT_MAX_ELEVATION_DEGREES * Math.PI) / 180)
    ).toBeGreaterThanOrEqual(0.7);
  });

  it("places every zone's sun inside that band", () => {
    for (const zoneId of ZONE_IDS) {
      const profile = RPG_REGION_PRESENTATION_PROFILES[zoneId];
      expect(
        profile.sunElevationDegrees,
        `${zoneId}:elevation`
      ).toBeGreaterThanOrEqual(RPG_KEY_LIGHT_MIN_ELEVATION_DEGREES);
      expect(
        profile.sunElevationDegrees,
        `${zoneId}:elevation`
      ).toBeLessThanOrEqual(RPG_KEY_LIGHT_MAX_ELEVATION_DEGREES);
    }
  });

  it("builds a key light position from an elevation and azimuth", () => {
    const [x, y, z] = getRpgKeyLightPosition(30, 90);

    expect(Math.hypot(x, y, z)).toBeCloseTo(RPG_KEY_LIGHT_DISTANCE, 6);
    expect(y).toBeCloseTo(RPG_KEY_LIGHT_DISTANCE * 0.5, 6);
    expect(x).toBeCloseTo(RPG_KEY_LIGHT_DISTANCE * Math.cos(Math.PI / 6), 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it("clamps an interpolated sun into the band before placing it", () => {
    // Midday must not be allowed to walk the sun back overhead.
    const overhead = resolveRpgKeyLightPlacement(74, 120);
    expect(overhead.elevationDegrees).toBe(RPG_KEY_LIGHT_MAX_ELEVATION_DEGREES);
    expect(overhead.facadeIncidence).toBeGreaterThan(0.7);

    const grazing = resolveRpgKeyLightPlacement(2, 120);
    expect(grazing.elevationDegrees).toBe(RPG_KEY_LIGHT_MIN_ELEVATION_DEGREES);

    for (const zoneId of ZONE_IDS) {
      const profile = RPG_REGION_PRESENTATION_PROFILES[zoneId];
      const placement = resolveRpgKeyLightPlacement(
        profile.sunElevationDegrees,
        profile.sunAzimuthDegrees
      );
      expect(placement.elevationDegrees, zoneId).toBe(
        profile.sunElevationDegrees
      );
      // The old overhead key gave a facade at most 0.19.
      expect(placement.facadeIncidence, zoneId).toBeGreaterThan(0.7);
      expect(placement.position[1], zoneId).toBeGreaterThan(0);
    }
  });

  it("puts the rim light low and on the far side of the key", () => {
    const key = resolveRpgKeyLightPlacement(30, 90).position;
    const rim = resolveRpgRimLightPosition(90);

    expect(rim[1]).toBeGreaterThan(0);
    expect(rim[1]).toBeLessThan(key[1]);
    // Opposite hemisphere: the horizontal directions point apart.
    expect(key[0] * rim[0] + key[2] * rim[2]).toBeLessThan(0);
  });

  it("keeps the shadow frustum and the sky dome inside the camera far plane", () => {
    // World bounds are +/-36; the shadow camera must cover them.
    expect(RPG_KEY_SHADOW_EXTENT).toBeGreaterThanOrEqual(36);
    expect(RPG_KEY_SHADOW_FAR).toBeGreaterThan(RPG_KEY_LIGHT_DISTANCE);
    expect(RPG_KEY_SHADOW_NORMAL_BIAS).toBeGreaterThan(0.02);
    expect(RPG_SKY_DOME_RADIUS).toBeLessThan(140);
  });
});
