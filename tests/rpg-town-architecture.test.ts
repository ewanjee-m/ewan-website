import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  InstancedMesh,
  MeshStandardMaterial
} from "three";
import {
  markRpgTownCameraFadeableBatch,
  RPG_TOWN_CAMERA_FADEABLE_BATCH_IDS
} from "../app/world/RpgTownArchitecture";
import {
  RPG_ARCHITECTURE_FACADE_DETAILS,
  RPG_ARCHITECTURE_STREET_PROPS,
  RPG_DISTRICT_ARCHITECTURE,
  RPG_PERIMETER_NEIGHBORHOOD
} from "../app/world/RpgTownArchitectureLayout";
import { RPG_GYUKATSU_OUTDOOR_DETAILS } from "../app/world/RpgTownDetailsLayout";
import { RPG_TOWN_BOUNDS } from "../app/world/RpgTownSceneLayout";

const architectureSource = readFileSync(
  resolve(process.cwd(), "app/world/RpgTownArchitecture.tsx"),
  "utf8"
);
const sceneSource = readFileSync(
  resolve(process.cwd(), "app/world/RpgTownScene.tsx"),
  "utf8"
);

describe("direct-rendered Japanese town architecture", () => {
  it("removes the repeated concept-image cylinder and the generic box cluster", () => {
    expect(sceneSource).toContain("<RpgTownArchitecture");
    expect(sceneSource).not.toContain("TownConceptHorizon");
    expect(sceneSource).not.toContain("RPG_TOWN_CONCEPT_HORIZON");
    expect(sceneSource).not.toContain("world-environment-concept.png");
    expect(sceneSource).not.toContain("DistrictVolumeClusters");
  });

  it("builds substantial volumetric architecture in every playable district", () => {
    expect(RPG_DISTRICT_ARCHITECTURE.length).toBeGreaterThanOrEqual(20);
    expect(new Set(RPG_DISTRICT_ARCHITECTURE.map(({ zoneId }) => zoneId))).toEqual(
      new Set(["airport", "tokyo", "gyukatsu", "sakura", "hanabi"])
    );

    for (const structure of RPG_DISTRICT_ARCHITECTURE) {
      expect(structure.size.every((value) => value > 0), structure.id).toBe(true);
      expect(structure.blocksMovement, structure.id).toBe(true);
      expect(structure.detailLevel, structure.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives every building visible geometry on its front, back, and both sides", () => {
    const buildings = RPG_DISTRICT_ARCHITECTURE.filter(
      ({ kind }) => kind !== "sakuraTree"
    );

    for (const building of buildings) {
      const sides = new Set(
        RPG_ARCHITECTURE_FACADE_DETAILS.filter(
          ({ structureId }) => structureId === building.id
        ).map(({ side }) => side)
      );
      expect(sides, building.id).toEqual(
        new Set(["north", "east", "south", "west"])
      );
    }
    expect(RPG_ARCHITECTURE_FACADE_DETAILS.length).toBeGreaterThanOrEqual(80);
  });

  it("fills streets with zone-specific physical props instead of image decoration", () => {
    expect(RPG_ARCHITECTURE_STREET_PROPS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(RPG_ARCHITECTURE_STREET_PROPS.map(({ zoneId }) => zoneId))).toEqual(
      new Set(["airport", "tokyo", "gyukatsu", "sakura", "hanabi"])
    );
    const propKinds = new Set(
      RPG_ARCHITECTURE_STREET_PROPS.map(({ kind }) => kind)
    );
    for (const expectedKind of [
      "bollard",
      "streetLamp",
      "vendingMachine",
      "outdoorUnit",
      "bambooFence",
      "festivalBanner"
    ] as const) {
      expect(propKinds.has(expectedKind), expectedKind).toBe(true);
    }

    for (const prop of RPG_ARCHITECTURE_STREET_PROPS) {
      expect(prop.blocksMovement, prop.id).toBe(false);
      expect(prop.position[0], prop.id).toBeGreaterThanOrEqual(
        RPG_TOWN_BOUNDS.minimumX
      );
      expect(prop.position[0], prop.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumX
      );
      expect(prop.position[2], prop.id).toBeGreaterThanOrEqual(
        RPG_TOWN_BOUNDS.minimumZ
      );
      expect(prop.position[2], prop.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumZ
      );
    }
  });

  it("keeps the Gyukatsu plaza lamp clear of the outdoor seating camera lane", () => {
    const lamp = RPG_ARCHITECTURE_STREET_PROPS.find(
      ({ id }) => id === "gyukatsu-lamp-a"
    )!;

    expect(lamp.position).toEqual([2.2, 1.65, 5.8]);
    for (const detail of RPG_GYUKATSU_OUTDOOR_DETAILS) {
      expect(
        Math.hypot(
          lamp.position[0] - detail.position[0],
          lamp.position[2] - detail.position[2]
        ),
        detail.id
      ).toBeGreaterThan(2);
    }
  });

  it("surrounds the square map with a direct-rendered neighborhood beyond its edge", () => {
    expect(RPG_PERIMETER_NEIGHBORHOOD.length).toBeGreaterThanOrEqual(28);
    expect(
      RPG_PERIMETER_NEIGHBORHOOD.every(({ position }) =>
        Math.abs(position[0]) > RPG_TOWN_BOUNDS.maximumX ||
        Math.abs(position[2]) > RPG_TOWN_BOUNDS.maximumZ
      )
    ).toBe(true);
    expect(new Set(RPG_PERIMETER_NEIGHBORHOOD.map(({ roofStyle }) => roofStyle)).size)
      .toBeGreaterThanOrEqual(3);
  });

  it("renders geometry, lighting, and shadows without texture projections or billboards", () => {
    expect(architectureSource.match(/<InstanceBatch\b/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
    expect(architectureSource).toContain("<Instances");
    expect(architectureSource).toContain("<boxGeometry");
    expect(architectureSource).toContain("<cylinderGeometry");
    expect(architectureSource).toContain("<coneGeometry");
    expect(architectureSource).toContain("<icosahedronGeometry");
    expect(architectureSource).toContain("castShadow");
    expect(architectureSource).toContain("receiveShadow");
    expect(architectureSource).not.toContain("TextureLoader");
    expect(architectureSource).not.toContain("useLoader");
    expect(architectureSource).not.toContain("<sprite");
    expect(architectureSource).not.toContain("<planeGeometry");
  });

  it("marks foreground canopy, foliage, prop posts, cables, and festival banners as fadeable camera occluders", () => {
    expect(RPG_TOWN_CAMERA_FADEABLE_BATCH_IDS).toEqual([
      "canopies",
      "foliage",
      "prop-posts",
      "overhead-cables",
      "festival-banners"
    ]);
    for (const batchId of RPG_TOWN_CAMERA_FADEABLE_BATCH_IDS) {
      expect(architectureSource).toContain(
        `cameraOcclusionFadeBatchId="${batchId}"`
      );
    }
    expect(
      architectureSource.match(
        /cameraOcclusionFadeBatchId="festival-banners"/g
      )
    ).toHaveLength(2);
  });

  it("preserves Drei instance bookkeeping while marking a fadeable camera batch", () => {
    const batch = new InstancedMesh(
      new BoxGeometry(),
      new MeshStandardMaterial(),
      1
    );
    const internalInstances: unknown[] = [];
    batch.userData = {
      instances: internalInstances,
      limit: 1,
      frames: 1
    };

    markRpgTownCameraFadeableBatch(batch, "foliage");

    expect(batch.userData).toMatchObject({
      cameraOccluder: true,
      cameraOcclusionFadeBatch: true,
      cameraOcclusionBatchId: "foliage",
      limit: 1,
      frames: 1
    });
    expect(batch.userData.instances).toBe(internalInstances);
  });
});
