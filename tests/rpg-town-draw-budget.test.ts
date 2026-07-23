import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRpgTownArchitectureBatchStats,
  RPG_TOWN_ARCHITECTURE_BATCH_STATS,
  type RpgTownBatchGeometry
} from "../app/world/RpgTownArchitecture";
import type { SceneQualityLevel } from "../app/world/SceneQuality";
import { RPG_COASTAL_ROCK_DETAILS } from "../app/world/RpgTownDetailsLayout";
import {
  RPG_COASTLINE_RING_ROCKS,
  RPG_HANGING_LANTERNS
} from "../app/world/RpgTownStreetLifeLayout";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";
import { getRpgLandmarkRenderTier } from "../app/world/RpgTownRenderTier";

const TOWN_DRAW_CALL_BUDGET = 120;
const TOWN_HIGH_QUALITY_TRIANGLE_BUDGET = 150_000;
const TOWN_LOW_QUALITY_TRIANGLE_BUDGET = 90_000;
const TOWN_RICH_TRIANGLE_ALLOWANCE = 24_000;

const TRIANGLES_PER_GEOMETRY: Record<RpgTownBatchGeometry, number> = {
  box: 12,
  cone4: 8,
  cylinder7: 28,
  cylinder8: 32,
  icosahedron1: 80
};

const sceneSource = readFileSync(
  resolve(process.cwd(), "app/world/RpgTownScene.tsx"),
  "utf8"
);
const architectureSource = readFileSync(
  resolve(process.cwd(), "app/world/RpgTownArchitecture.tsx"),
  "utf8"
);
const detailsSource = readFileSync(
  resolve(process.cwd(), "app/world/RpgTownDetails.tsx"),
  "utf8"
);

function readComponentSource(name: string, nextName: string): string {
  const start = sceneSource.indexOf(`function ${name}`);
  const end = sceneSource.indexOf(`function ${nextName}`, start);
  if (start < 0 || end <= start) {
    throw new Error(`Unable to isolate ${name} in RpgTownScene.tsx`);
  }
  return sceneSource.slice(start, end);
}

function countDrawUnits(source: string): number {
  const instanced = source.match(/<Instances\b/g)?.length ?? 0;
  const meshes = source.match(/<mesh\b/g)?.length ?? 0;
  const roundedBoxes = source.match(/<RoundedBox\b/g)?.length ?? 0;
  const instancedMeshes = source.match(/<instancedMesh\b/g)?.length ?? 0;
  const lineSegments = source.match(/<lineSegments\b/g)?.length ?? 0;
  return instanced + meshes + roundedBoxes + instancedMeshes + lineSegments;
}

function countRichLandmarks(kind: string): number {
  return RPG_LANDMARKS.filter(
    (landmark) =>
      landmark.kind === kind && getRpgLandmarkRenderTier(landmark) === "rich"
  ).length;
}

const npcCount = RPG_LANDMARKS.filter(({ kind }) => kind === "npc").length;

const SCENE_COMPONENT_BLOCKS = [
  { name: "TownSurfaces", next: "AirportPlane", copies: 1 },
  { name: "AirportPlane", next: "TownHorizon", copies: 1 },
  { name: "TownHorizon", next: "Terminal", copies: 1 },
  { name: "Terminal", next: "AirportBus", copies: countRichLandmarks("terminal") },
  { name: "AirportBus", next: "CorridorFacade", copies: countRichLandmarks("bus") },
  { name: "CorridorFacade", next: "TokyoTower", copies: countRichLandmarks("tower") },
  { name: "TokyoTower", next: "PitchedRoof", copies: countRichLandmarks("tower") },
  { name: "PitchedRoof", next: "Machiya", copies: countRichLandmarks("machiya") },
  { name: "Machiya", next: "SakuraTree", copies: countRichLandmarks("machiya") },
  { name: "SakuraTree", next: "Canal", copies: countRichLandmarks("sakuraTree") },
  { name: "Canal", next: "Bridge", copies: countRichLandmarks("canal") },
  { name: "Bridge", next: "FestivalStall", copies: countRichLandmarks("bridge") },
  { name: "FestivalStall", next: "FestivalLanterns", copies: countRichLandmarks("stall") },
  { name: "FestivalLanterns", next: "TownTorii", copies: 1 },
  { name: "TownTorii", next: "TownCrowd", copies: 1 },
  { name: "TownCrowd", next: "HanabiBurst", copies: npcCount },
  { name: "HanabiBurst", next: "Landmark", copies: countRichLandmarks("hanabi") }
] as const;

const townDrawCalls =
  SCENE_COMPONENT_BLOCKS.reduce(
    (total, block) =>
      total + countDrawUnits(readComponentSource(block.name, block.next)) * block.copies,
    0
  ) +
  (architectureSource.match(/<InstanceBatch\b/g)?.length ?? 0) +
  (detailsSource.match(/<Instances\b/g)?.length ?? 0);

function measureTownTriangles(level: SceneQualityLevel): number {
  return (
    getRpgTownArchitectureBatchStats(level).reduce(
      (total, batch) =>
        total + batch.instanceCount * TRIANGLES_PER_GEOMETRY[batch.geometry],
      0
    ) +
    (RPG_COASTAL_ROCK_DETAILS.length + RPG_COASTLINE_RING_ROCKS.length) * 36 +
    RPG_HANGING_LANTERNS.length * 40 +
    TOWN_RICH_TRIANGLE_ALLOWANCE
  );
}

const townTriangles = measureTownTriangles("high");
const townLowQualityTriangles = measureTownTriangles("low");

describe("RPG town render budget", () => {
  it("keeps the town inside its share of the scene draw-call budget", () => {
    expect(townDrawCalls).toBeLessThanOrEqual(TOWN_DRAW_CALL_BUDGET);
  });

  it("keeps the town inside its triangle budget at both quality tiers", () => {
    expect(townTriangles).toBeLessThanOrEqual(
      TOWN_HIGH_QUALITY_TRIANGLE_BUDGET
    );
    expect(townLowQualityTriangles).toBeLessThanOrEqual(
      TOWN_LOW_QUALITY_TRIANGLE_BUDGET
    );
    expect(townLowQualityTriangles).toBeLessThan(townTriangles);
  });

  it("tracks every architecture batch in the measured statistics", () => {
    const renderedBatches =
      architectureSource.match(/<InstanceBatch\b/g)?.length ?? 0;

    expect(RPG_TOWN_ARCHITECTURE_BATCH_STATS).toHaveLength(renderedBatches);
    expect(
      new Set(RPG_TOWN_ARCHITECTURE_BATCH_STATS.map(({ id }) => id)).size
    ).toBe(RPG_TOWN_ARCHITECTURE_BATCH_STATS.length);
    expect(
      RPG_TOWN_ARCHITECTURE_BATCH_STATS.every(
        ({ instanceCount }) => instanceCount > 0
      )
    ).toBe(true);
  });

  it("never repeats a single mesh through a list so the batch count is the draw count", () => {
    expect(sceneSource).not.toContain("<mesh key=");
    expect(sceneSource).not.toContain("<RoundedBox key=");
    expect(sceneSource.match(/<Instance\b/g)?.length ?? 0).toBeGreaterThan(
      sceneSource.match(/<mesh\b/g)?.length ?? 0
    );
  });

  it("lights a dense window grid on the district facades", () => {
    const stats = getRpgTownArchitectureBatchStats("high");
    const lit = stats.find(({ id }) => id === "facade-windows-lit");
    const dark = stats.find(({ id }) => id === "facade-windows-dark");
    const perimeterLit = stats.find(
      ({ id }) => id === "perimeter-windows-lit"
    );

    expect(lit).toBeDefined();
    expect(dark).toBeDefined();
    expect(perimeterLit).toBeDefined();
    expect(
      (lit?.instanceCount ?? 0) + (dark?.instanceCount ?? 0)
    ).toBeGreaterThanOrEqual(1200);
    expect(lit?.instanceCount ?? 0).toBeGreaterThan(
      ((lit?.instanceCount ?? 0) + (dark?.instanceCount ?? 0)) * 0.35
    );
    expect(perimeterLit?.instanceCount ?? 0).toBeGreaterThan(200);
  });

  it("grows scenery through shared instance batches instead of per-object meshes", () => {
    const architectureMeshes =
      architectureSource.match(/<mesh\b/g)?.length ?? 0;
    const detailMeshes = detailsSource.match(/<mesh\b/g)?.length ?? 0;
    const totalArchitectureInstances = RPG_TOWN_ARCHITECTURE_BATCH_STATS.reduce(
      (total, batch) => total + batch.instanceCount,
      0
    );

    expect(architectureMeshes).toBe(0);
    expect(detailMeshes).toBe(0);
    expect(totalArchitectureInstances).toBeGreaterThan(1200);
  });
});
