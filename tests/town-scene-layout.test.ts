import { describe, expect, it } from "vitest";
import {
  TOWN_BACKDROP,
  TOWN_BOUNDS,
  TOWN_SURFACES,
  TOWN_STRUCTURES,
  TOWN_WALK_CORRIDOR,
  TOWN_ZONES
} from "../app/world/TownSceneLayout";

describe("town scene layout", () => {
  it("orders all five destinations from the airport to the hanabi village", () => {
    expect(TOWN_ZONES.map((zone) => zone.id)).toEqual([
      "airport",
      "tokyo",
      "gyukatsu",
      "sakura",
      "hanabi"
    ]);

    for (let index = 1; index < TOWN_ZONES.length; index += 1) {
      expect(TOWN_ZONES[index - 1].maximumX).toBe(TOWN_ZONES[index].minimumX);
      expect(TOWN_ZONES[index - 1].centerX).toBeLessThan(
        TOWN_ZONES[index].centerX
      );
    }
  });

  it("keeps the rectangular player corridor free from blocking structures", () => {
    expect(TOWN_WALK_CORRIDOR.minimumZ).toBeLessThan(0);
    expect(TOWN_WALK_CORRIDOR.maximumZ).toBeGreaterThan(0);

    for (const structure of TOWN_STRUCTURES.filter(
      ({ blocksMovement }) => blocksMovement
    )) {
      const halfWidth = structure.size[0] / 2;
      const halfDepth = structure.size[2] / 2;
      const footprintIsOutsideCorridor =
        structure.position[0] + halfWidth <= TOWN_WALK_CORRIDOR.minimumX ||
        structure.position[0] - halfWidth >= TOWN_WALK_CORRIDOR.maximumX ||
        structure.position[2] + halfDepth <= TOWN_WALK_CORRIDOR.minimumZ ||
        structure.position[2] - halfDepth >= TOWN_WALK_CORRIDOR.maximumZ;

      expect(footprintIsOutsideCorridor, structure.id).toBe(true);
    }
  });

  it("keeps every structure footprint inside the rectangular town", () => {
    for (const structure of TOWN_STRUCTURES) {
      const halfWidth = structure.size[0] / 2;
      const halfDepth = structure.size[2] / 2;

      expect(structure.position[0] - halfWidth, structure.id).toBeGreaterThanOrEqual(
        TOWN_BOUNDS.minimumX
      );
      expect(structure.position[0] + halfWidth, structure.id).toBeLessThanOrEqual(
        TOWN_BOUNDS.maximumX
      );
      expect(structure.position[2] - halfDepth, structure.id).toBeGreaterThanOrEqual(
        TOWN_BOUNDS.minimumZ
      );
      expect(structure.position[2] + halfDepth, structure.id).toBeLessThanOrEqual(
        TOWN_BOUNDS.maximumZ
      );
    }
  });

  it("gives every destination its recognizable three-dimensional landmarks", () => {
    expect(new Set(TOWN_STRUCTURES.map(({ zoneId }) => zoneId))).toEqual(
      new Set(["airport", "tokyo", "gyukatsu", "sakura", "hanabi"])
    );

    expect(
      TOWN_STRUCTURES.map(({ zoneId, kind }) => `${zoneId}:${kind}`)
    ).toEqual(
      expect.arrayContaining([
        "airport:building",
        "airport:bus",
        "tokyo:building",
        "gyukatsu:shop",
        "sakura:tree",
        "sakura:canal",
        "sakura:bridge",
        "hanabi:stall",
        "hanabi:lantern",
        "hanabi:hanabi"
      ])
    );
  });

  it("keeps the approved panorama as distant scenery instead of walkable ground", () => {
    expect(TOWN_BACKDROP.asset).toBe(
      "/assets/world/world-environment-concept.png"
    );
    expect(TOWN_BACKDROP.position[2]).toBeLessThan(TOWN_BOUNDS.minimumZ);
    expect(TOWN_BACKDROP.size[0]).toBeGreaterThan(
      TOWN_BOUNDS.maximumX - TOWN_BOUNDS.minimumX
    );
  });

  it("builds the route from volumetric ground, road, and two sidewalks", () => {
    expect(TOWN_SURFACES.map(({ kind }) => kind)).toEqual([
      "ground",
      "road",
      "sidewalk",
      "sidewalk"
    ]);
    for (const surface of TOWN_SURFACES) {
      expect(surface.size.every((length) => length > 0), surface.id).toBe(true);
    }
  });
});
