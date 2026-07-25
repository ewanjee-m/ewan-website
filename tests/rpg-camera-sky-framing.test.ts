import { describe, expect, it } from "vitest";
import { getRegionCameraProfile } from "../app/world/ChaseOrbitCamera";
import type { DestinationId } from "../app/guide/GuideContract";

const ZONES: readonly DestinationId[] = [
  "airport",
  "tokyo",
  "gyukatsu",
  "sakura",
  "hanabi"
];

const VIEWPORTS = ["desktop", "mobile"] as const;

/**
 * How high above the horizon the top edge of the frame reaches. The camera
 * looks down by its pitch, and the frame opens half the field of view above
 * that line, so anything higher than this angle is off screen.
 */
function topOfFrameDegrees(zone: DestinationId, viewport: "desktop" | "mobile") {
  const profile = getRegionCameraProfile(zone, viewport);
  return profile.fovDegrees / 2 - profile.pitchDegrees;
}

describe("camera framing", () => {
  /**
   * The old table pitched so far down that the top edge sat at +0.5 degrees at
   * the airport and below the horizon at gyukatsu: the visitor could not see
   * sky at all, which made the world read as a flat floor and hid the
   * fireworks completely.
   */
  it("keeps sky in the frame in every zone", () => {
    for (const zone of ZONES) {
      for (const viewport of VIEWPORTS) {
        expect(topOfFrameDegrees(zone, viewport)).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("still looks down enough to read the ground the visitor walks on", () => {
    for (const zone of ZONES) {
      for (const viewport of VIEWPORTS) {
        const profile = getRegionCameraProfile(zone, viewport);
        expect(profile.pitchDegrees).toBeGreaterThanOrEqual(8);
        expect(profile.pitchDegrees).toBeLessThanOrEqual(20);
      }
    }
  });

  /**
   * Walking between zones should not feel like the lens was swapped. The old
   * table jumped 45 to 60 degrees on desktop and 52 to 75 on mobile, which
   * stretched the world the moment the visitor crossed a boundary.
   */
  it("holds one lens across the whole walk", () => {
    for (const viewport of VIEWPORTS) {
      const fovs = ZONES.map(
        (zone) => getRegionCameraProfile(zone, viewport).fovDegrees
      );
      expect(Math.max(...fovs) - Math.min(...fovs)).toBeLessThanOrEqual(6);
    }
  });

  it("frames the fireworks from the zones the visitor walks through", () => {
    // The bursts sit between 6 and 12 degrees above the horizon seen from the
    // western zones. Those are the views that should show the visitor where
    // the festival is.
    for (const zone of ["airport", "tokyo", "gyukatsu"] as const) {
      for (const viewport of VIEWPORTS) {
        expect(topOfFrameDegrees(zone, viewport)).toBeGreaterThan(12);
      }
    }
  });
});
