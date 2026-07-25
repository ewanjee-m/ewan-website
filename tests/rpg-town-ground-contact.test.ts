import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RPG_ARCHITECTURE_GROUND_SKIRTS,
  RPG_ARCHITECTURE_GROUND_SKIRT_COLOR,
  RPG_ARCHITECTURE_GROUND_SKIRT_SPREAD,
  RPG_ARCHITECTURE_GROUND_SKIRT_TOP,
  RPG_DISTRICT_ARCHITECTURE
} from "../app/world/RpgTownArchitectureLayout";
import {
  RPG_SURFACE_LAYER_LIFT,
  RPG_SURFACE_LAYER_STEP
} from "../app/world/RpgWorldSurfaces";
import { RPG_TOWN_SURFACES } from "../app/world/RpgTownSceneLayout";

const BUILDINGS = RPG_DISTRICT_ARCHITECTURE.filter(
  ({ kind }) => kind !== "sakuraTree"
);

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), `app/world/${name}`), "utf8");

describe("RPG town ground contact", () => {
  it("gives every district building a contact skirt on every quality tier", () => {
    // Shadow maps are off on the low tier, so nothing but a static skirt
    // grounds a building there.
    expect(RPG_ARCHITECTURE_GROUND_SKIRTS).toHaveLength(BUILDINGS.length);
    for (const structure of BUILDINGS) {
      const skirt = RPG_ARCHITECTURE_GROUND_SKIRTS.find(
        (candidate) => candidate.structureId === structure.id
      );
      expect(skirt, structure.id).toBeDefined();
      expect(skirt!.position[0]).toBeCloseTo(structure.position[0], 6);
      expect(skirt!.position[2]).toBeCloseTo(structure.position[2], 6);
      expect(skirt!.rotationY).toBeCloseTo(structure.rotationY, 6);
      expect(skirt!.size[0]).toBeCloseTo(
        structure.size[0] * RPG_ARCHITECTURE_GROUND_SKIRT_SPREAD,
        6
      );
      expect(skirt!.size[2]).toBeCloseTo(
        structure.size[2] * RPG_ARCHITECTURE_GROUND_SKIRT_SPREAD,
        6
      );
      expect(skirt!.size[0]).toBeGreaterThan(structure.size[0]);
    }
  });

  it("floats the skirt clear of every walkable surface layer", () => {
    const highestSurfaceLayer =
      RPG_SURFACE_LAYER_LIFT +
      (RPG_TOWN_SURFACES.filter(({ kind }) => kind !== "water").length - 1) *
        RPG_SURFACE_LAYER_STEP;

    expect(RPG_ARCHITECTURE_GROUND_SKIRT_TOP).toBeGreaterThan(
      highestSurfaceLayer + 0.005
    );
    for (const skirt of RPG_ARCHITECTURE_GROUND_SKIRTS) {
      expect(skirt.position[1] + skirt.size[1] / 2).toBeCloseTo(
        RPG_ARCHITECTURE_GROUND_SKIRT_TOP,
        6
      );
    }
  });

  it("keeps the skirt darker than every authored ground colour", () => {
    const value = (hex: string) => {
      const raw = Number.parseInt(hex.slice(1), 16);
      return ((raw >> 16) & 0xff) + ((raw >> 8) & 0xff) + (raw & 0xff);
    };

    for (const surface of RPG_TOWN_SURFACES.filter(
      ({ kind }) => kind !== "water"
    )) {
      expect(
        value(RPG_ARCHITECTURE_GROUND_SKIRT_COLOR),
        surface.id
      ).toBeLessThan(value(surface.color));
    }
  });

  it("renders the skirts in the existing ground dressing batch", () => {
    const source = read("RpgTownArchitecture.tsx");

    expect(source).toContain("RPG_ARCHITECTURE_GROUND_SKIRTS");
    expect(source).toContain("groundDressingInstances");
  });

  it("flat shades every faceted batch so curved props read as low poly", () => {
    const batches = read("RpgTownArchitecture.tsx")
      .split("<InstanceBatch")
      .slice(1)
      .filter((batch) =>
        /<(cylinderGeometry|icosahedronGeometry|coneGeometry)/.test(batch)
      );

    expect(batches.length).toBeGreaterThanOrEqual(8);
    for (const batch of batches) {
      const label = batch.slice(0, batch.indexOf("geometry="));
      expect(batch, label).toContain("flatShading");
    }
  });
});
