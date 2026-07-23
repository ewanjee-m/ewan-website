import { describe, expect, it } from "vitest";
import {
  getDestinationArrivalHeading,
  FLAT_WORLD_HALF_WIDTH,
  calculateGuideDirection,
  getCurrentZoneId,
  getDestinationPosition
} from "../app/guide/WorldNavigation";
import type { VectorTuple } from "../app/guide/WorldNavigation";
import {
  getArrival,
  getNavigationRegionAt
} from "../app/world/RpgWorldGeometry";
import { RPG_WORLD_LANDMARKS, RPG_WORLD_ZONES } from "../app/world/RpgWorldModel";

const halfWidth = 36;

describe("world guide navigation", () => {
  it("maps the square town to the nearest visitor-facing district", () => {
    expect(getCurrentZoneId([-30, 0, 0])).toBe("airport");
    expect(getCurrentZoneId([-8, 0, 20])).toBe("tokyo");
    expect(getCurrentZoneId([8, 0, 0])).toBe("gyukatsu");
    expect(getCurrentZoneId([9, 0, -20])).toBe("sakura");
    const hanabiArrival = [...getArrival("hanabi").position] as VectorTuple;
    expect(getCurrentZoneId(hanabiArrival)).toBe("hanabi");
  });

  it("uses the canonical navigation snapshot during a directed transition", () => {
    const position: [number, number, number] = [-20, 0, 1];
    expect(getCurrentZoneId(position)).toBe(
      getNavigationRegionAt(position)?.displayZoneId
    );
  });

  it("uses the flat walking plane and player heading for localized direction IDs", () => {
    const base = {
      position: [-30, 0, 0] as [number, number, number],
      surfaceNormal: [0, 1, 0] as [number, number, number],
      destinationId: "tokyo" as const
    };

    expect(calculateGuideDirection({ ...base, heading: [1, 0, 0] })).toBe("straight");
    expect(calculateGuideDirection({ ...base, heading: [-1, 0, 0] })).toBe("turnAround");
    expect(calculateGuideDirection({ ...base, heading: [0, 0, -1] })).toBe("right");
    expect(calculateGuideDirection({ ...base, heading: [0, 0, 1] })).toBe("left");
  });

  it("returns marker positions distributed over both town axes", () => {
    expect(FLAT_WORLD_HALF_WIDTH).toBe(36);
    expect(getDestinationPosition("airport", halfWidth)).toEqual([-30, 0, 0]);
    expect(getDestinationPosition("tokyo", halfWidth)).toEqual([-8, 0, 20]);
    expect(getDestinationPosition("gyukatsu", halfWidth)).toEqual([8, 0, 0]);
    expect(getDestinationPosition("sakura", halfWidth)).toEqual([9, 0, -20]);
    expect(getDestinationPosition("hanabi", halfWidth)).toEqual(
      getArrival("hanabi").position
    );
  });
});

describe("arrival view", () => {
  it("gives every zone a unit facing to arrive on", () => {
    for (const destinationId of [
      "airport",
      "tokyo",
      "gyukatsu",
      "sakura",
      "hanabi"
    ] as const) {
      const [x, z] = getDestinationArrivalHeading(destinationId);
      expect(Math.hypot(x, z), destinationId).toBeCloseTo(1, 10);
    }
  });

  it("faces every arrival toward its canonical primary landmark", () => {
    for (const zone of RPG_WORLD_ZONES) {
      const position = getDestinationPosition(zone.id);
      const heading = getDestinationArrivalHeading(zone.id);
      const landmark = RPG_WORLD_LANDMARKS.find(({ id }) => id === zone.primaryLandmarkId)!;
      const targetX = landmark.position[0] - position[0];
      const targetZ = landmark.position[2] - position[2];
      const targetLength = Math.hypot(targetX, targetZ);
      expect(
        heading[0] * (targetX / targetLength) + heading[1] * (targetZ / targetLength),
        zone.id
      ).toBeGreaterThan(0.7);
    }
  });
});
