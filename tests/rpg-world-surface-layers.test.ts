import { describe, expect, it } from "vitest";
import {
  RPG_SURFACE_LAYER_LIFT,
  RPG_SURFACE_LAYER_STEP,
  RPG_SURFACE_WATER_TOP,
  resolveRpgSurfaceMeshPosition
} from "../app/world/RpgWorldSurfaces";
import { RPG_TOWN_SURFACES } from "../app/world/RpgTownSceneLayout";
import { getSurfaceHeight } from "../app/world/RpgWorldGeometry";

const LAND = RPG_TOWN_SURFACES.filter(({ kind }) => kind !== "water");
const WATER = RPG_TOWN_SURFACES.filter(({ kind }) => kind === "water");

const renderedTop = (id: string) => {
  const surface = RPG_TOWN_SURFACES.find((candidate) => candidate.id === id);
  if (!surface) throw new Error(`unknown surface ${id}`);
  return resolveRpgSurfaceMeshPosition(surface)[1] + surface.size[1] / 2;
};

const KIND_ORDER = ["ground", "plaza", "road", "sidewalk"] as const;

describe("RPG world surface depth layering", () => {
  it("gives every land surface a rendered top no other land surface shares", () => {
    const tops = LAND.map((surface) => renderedTop(surface.id));
    const unique = new Set(tops.map((top) => top.toFixed(6)));

    expect(LAND.length).toBeGreaterThan(1);
    expect(unique.size).toBe(LAND.length);
  });

  it("separates coplanar spawn surfaces by at least one layer step", () => {
    // The airport spawn stacks meadow, apron, bus plaza and a cross street.
    // Every one of them used to render at the same top, which z-fought.
    const stack = [
      "town-meadow",
      "airport-coastal-apron",
      "airport-bus-plaza",
      "gyukatsu-cross-street-surface"
    ].map(renderedTop);

    for (let index = 1; index < stack.length; index += 1) {
      expect(stack[index] - stack[index - 1]).toBeGreaterThanOrEqual(
        RPG_SURFACE_LAYER_STEP * 0.999
      );
    }
  });

  it("stacks the kinds in walk order so paving never sinks under a road", () => {
    const highestOf = (kind: string) =>
      Math.max(
        ...LAND.filter((surface) => surface.kind === kind).map((surface) =>
          renderedTop(surface.id)
        )
      );
    const lowestOf = (kind: string) =>
      Math.min(
        ...LAND.filter((surface) => surface.kind === kind).map((surface) =>
          renderedTop(surface.id)
        )
      );

    for (let index = 1; index < KIND_ORDER.length; index += 1) {
      expect(
        lowestOf(KIND_ORDER[index]),
        `${KIND_ORDER[index]} over ${KIND_ORDER[index - 1]}`
      ).toBeGreaterThan(highestOf(KIND_ORDER[index - 1]));
    }
  });

  it("keeps every rendered top inside the authored walk-height tolerance", () => {
    for (const surface of LAND) {
      const deviation = Math.abs(
        renderedTop(surface.id) -
          getSurfaceHeight([surface.position[0], surface.position[2]])
      );
      expect(deviation, surface.id).toBeLessThanOrEqual(0.02);
      expect(deviation, surface.id).toBeGreaterThanOrEqual(
        RPG_SURFACE_LAYER_LIFT * 0.999
      );
    }
  });

  it("lifts the sea to a shoreline lip instead of a half-metre cliff", () => {
    expect(WATER.length).toBeGreaterThan(0);
    for (const surface of WATER) {
      const position = resolveRpgSurfaceMeshPosition(surface);
      const top = position[1] + surface.size[1] / 2;
      const authoredTop = surface.position[1] + surface.size[1] / 2;

      expect(top).toBeCloseTo(RPG_SURFACE_WATER_TOP, 6);
      expect(top).toBeGreaterThan(authoredTop);
      // The exposed meadow wall above the waterline stays under 12 cm.
      expect(RPG_SURFACE_LAYER_LIFT - top).toBeLessThanOrEqual(0.12);
      // The sea still sits below every walkable surface.
      expect(top).toBeLessThan(Math.min(...LAND.map((s) => renderedTop(s.id))));
      expect(position[0]).toBe(surface.position[0]);
      expect(position[2]).toBe(surface.position[2]);
    }
  });
});
