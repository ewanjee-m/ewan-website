import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRpgTownArchitectureBatchStats,
  type RpgTownBatchGeometry
} from "../app/world/RpgTownArchitecture";
import { RPG_TOWN_DETAIL_BATCH_STATS } from "../app/world/RpgTownDetails";
import { RPG_SIGNATURE_LANDMARK_BATCH_STATS } from "../app/world/RpgSignatureLandmarks";
import { RPG_WORLD_SURFACE_BATCH_STATS } from "../app/world/RpgWorldSurfaces";
import type { SceneQualityLevel } from "../app/world/SceneQuality";

const SOURCES = [
  "RpgWorldSurfaces.tsx",
  "RpgSignatureLandmarks.tsx",
  "RpgTownArchitecture.tsx",
  "RpgTownDetails.tsx"
].map((file) => readFileSync(resolve(process.cwd(), `app/world/${file}`), "utf8"));

const TRIANGLES_PER_GEOMETRY: Record<RpgTownBatchGeometry, number> = {
  box: 12, cone4: 8, cylinder7: 28, cylinder8: 32, icosahedron1: 80
};

function countDrawUnits(source: string) {
  return (
    (source.match(/<Instances\b/g)?.length ?? 0) +
    (source.match(/<InstanceBatch\b/g)?.length ?? 0) +
    (source.match(/<mesh\b/g)?.length ?? 0) +
    (source.match(/<points\b/g)?.length ?? 0)
  );
}

function measureTownTriangles(level: SceneQualityLevel) {
  const architecture = getRpgTownArchitectureBatchStats(level).reduce(
    (sum, stat) => sum + stat.instanceCount * TRIANGLES_PER_GEOMETRY[stat.geometry],
    0
  );
  const procedural = [
    ...RPG_WORLD_SURFACE_BATCH_STATS,
    ...RPG_SIGNATURE_LANDMARK_BATCH_STATS,
    ...RPG_TOWN_DETAIL_BATCH_STATS
  ].reduce((sum, stat) => sum + stat.triangleCount, 0);
  return architecture + procedural;
}

describe("RPG town render budget", () => {
  it("stays inside the 120 draw-unit budget", () => {
    expect(SOURCES.reduce((sum, source) => sum + countDrawUnits(source), 0))
      .toBeLessThanOrEqual(120);
  });

  it("stays inside high and low triangle budgets", () => {
    expect(measureTownTriangles("high")).toBeLessThanOrEqual(150_000);
    expect(measureTownTriangles("low")).toBeLessThanOrEqual(90_000);
    expect(measureTownTriangles("low")).toBeLessThan(measureTownTriangles("high"));
  });

  it("exports non-empty statistics for every procedural group", () => {
    for (const stats of [
      RPG_WORLD_SURFACE_BATCH_STATS,
      RPG_SIGNATURE_LANDMARK_BATCH_STATS,
      RPG_TOWN_DETAIL_BATCH_STATS
    ]) {
      expect(stats.length).toBeGreaterThan(0);
      expect(stats.every(({ drawUnits, triangleCount }) => drawUnits > 0 && triangleCount > 0))
        .toBe(true);
    }
  });
});
