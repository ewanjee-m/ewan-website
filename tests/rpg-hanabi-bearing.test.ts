import { describe, expect, it } from "vitest";
import { RPG_HANABI_BURSTS } from "../app/world/RpgHanabiLayout";
import { getRegionCameraProfile } from "../app/world/ChaseOrbitCamera";
import { RPG_CANONICAL_ROUTE } from "./fixtures/rpg-canonical-route";

const ARRIVAL = RPG_CANONICAL_ROUTE.at(-1)!;
const APPROACH = RPG_CANONICAL_ROUTE.at(-2)!;

// The chase camera settles behind the way the visitor walked in, so the view
// bearing on arrival is the bearing of the last leg of the route.
const ARRIVAL_VIEW_YAW = Math.atan2(
  ARRIVAL[0] - APPROACH[0],
  ARRIVAL[1] - APPROACH[1]
);

const HANABI = getRegionCameraProfile("hanabi", "desktop");
const EYE_HEIGHT = 1.15 + Math.sin((HANABI.pitchDegrees * Math.PI) / 180) * HANABI.distance;
const TOP_OF_FRAME_DEGREES = HANABI.fovDegrees / 2 - HANABI.pitchDegrees;

function shellFromArrival(position: readonly [number, number, number]) {
  const dx = position[0] - ARRIVAL[0];
  const dz = position[2] - ARRIVAL[1];
  const horizontal = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, dz);
  const offAxis = Math.atan2(
    Math.sin(bearing - ARRIVAL_VIEW_YAW),
    Math.cos(bearing - ARRIVAL_VIEW_YAW)
  );
  return {
    horizontal,
    offAxisDegrees: (offAxis * 180) / Math.PI,
    elevationDegrees:
      (Math.atan2(position[1] - EYE_HEIGHT, horizontal) * 180) / Math.PI
  };
}

describe("fireworks seen from the festival", () => {
  /**
   * Measured in a real browser at the canonical arrival: every shell sat
   * between 157 and 177 degrees off the view axis — squarely behind the
   * visitor — while their elevation was already inside the frame. The zone the
   * whole walk builds towards opened on an empty sky.
   */
  it("puts fireworks in front of a visitor arriving at Hanabi", () => {
    const ahead = RPG_HANABI_BURSTS.filter((burst) => {
      const seen = shellFromArrival(burst.position);
      return (
        Math.abs(seen.offAxisDegrees) <= HANABI.fovDegrees / 2 &&
        seen.elevationDegrees <= TOP_OF_FRAME_DEGREES &&
        seen.elevationDegrees > 0
      );
    });
    expect(ahead.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps every shell high enough to read as sky, not as a street light", () => {
    for (const burst of RPG_HANABI_BURSTS) {
      const seen = shellFromArrival(burst.position);
      expect(seen.elevationDegrees).toBeGreaterThan(6);
    }
  });

  it("spreads the display rather than stacking it on one bearing", () => {
    const bearings = RPG_HANABI_BURSTS.map(
      (burst) => shellFromArrival(burst.position).offAxisDegrees
    );
    expect(Math.max(...bearings) - Math.min(...bearings)).toBeGreaterThan(60);
  });
});
