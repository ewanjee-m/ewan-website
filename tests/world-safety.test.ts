import { describe, expect, it } from "vitest";
import {
  AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS,
  AIRPORT_BUS_HALF_LENGTH,
  AIRPORT_CROSSWALK_HALF_LENGTH,
  AIRPORT_CROSSWALK_ROUTE_PROGRESS,
  AIRPORT_CROSSWALK_TRACK_ANGLE,
  BUS_COLLISION_HALF_WIDTH,
  BUS_LANE_CENTER_OFFSET,
  isPlayerInAirportCrosswalk,
  PLAYER_COLLISION_RADIUS,
  SAFE_CORRIDOR_HALF_WIDTH,
  WORLD_PATH_WIDTH,
  WORLD_RADIUS
} from "../app/world/WorldSafety";

describe("world safety geometry", () => {
  it("keeps a three-character-wide path and separates the bus lane", () => {
    expect(WORLD_PATH_WIDTH).toBeGreaterThanOrEqual(
      PLAYER_COLLISION_RADIUS * 2 * 3
    );
    expect(SAFE_CORRIDOR_HALF_WIDTH + PLAYER_COLLISION_RADIUS).toBeCloseTo(
      WORLD_PATH_WIDTH / 2,
      8
    );
    expect(BUS_LANE_CENTER_OFFSET - BUS_COLLISION_HALF_WIDTH).toBeGreaterThan(
      WORLD_PATH_WIDTH / 2
    );
  });

  it("stops the whole bus before the occupied crosswalk", () => {
    const centerDistance =
      (AIRPORT_CROSSWALK_ROUTE_PROGRESS -
        AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS) *
      Math.PI *
      2 *
      WORLD_RADIUS;

    expect(centerDistance - AIRPORT_BUS_HALF_LENGTH).toBeGreaterThan(
      AIRPORT_CROSSWALK_HALF_LENGTH + PLAYER_COLLISION_RADIUS
    );
  });

  it("detects a player crossing from the walking path as crosswalk occupancy", () => {
    const playerAtWalkingPath = {
      x: 0,
      y: Math.cos(AIRPORT_CROSSWALK_TRACK_ANGLE) * WORLD_RADIUS,
      z: -Math.sin(AIRPORT_CROSSWALK_TRACK_ANGLE) * WORLD_RADIUS
    };
    const outsideAngle =
      AIRPORT_CROSSWALK_TRACK_ANGLE +
      (AIRPORT_CROSSWALK_HALF_LENGTH + 0.2) / WORLD_RADIUS;

    expect(isPlayerInAirportCrosswalk(playerAtWalkingPath)).toBe(true);
    expect(
      isPlayerInAirportCrosswalk({
        x: 0,
        y: Math.cos(outsideAngle) * WORLD_RADIUS,
        z: -Math.sin(outsideAngle) * WORLD_RADIUS
      })
    ).toBe(false);
  });
});
