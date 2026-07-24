import {
  getRpgTownArchitectureBatchStats,
  type RpgTownBatchGeometry
} from "./RpgTownArchitecture";
import {
  RPG_COASTAL_ROCK_DETAILS,
  RPG_GYUKATSU_OUTDOOR_DETAILS,
  RPG_TOKYO_CROSSWALK_DETAILS
} from "./RpgTownDetailsLayout";
import {
  RPG_COASTLINE_RING_ROCKS
} from "./RpgTownStreetLifeLayout";
import {
  RPG_LANDMARKS,
  RPG_TOWN_SURFACES
} from "./RpgTownSceneLayout";
import { getRpgLandmarkRenderTier } from "./RpgTownRenderTier";
import { RPG_WORLD_BRIDGE } from "./RpgWorldModel";
import type { SceneQualityLevel } from "./SceneQuality";

export const RPG_BRIDGE_DECK_SEGMENT_COUNT = 24;

export const RPG_RENDERED_SURFACE_GROUPS = {
  rectangularWater: RPG_TOWN_SURFACES.filter(
    ({ kind, shape }) => kind === "water" && shape !== "circle"
  ),
  rectangularLand: RPG_TOWN_SURFACES.filter(
    ({ id, kind, shape }) =>
      id !== RPG_WORLD_BRIDGE.id && kind !== "water" && shape !== "circle"
  ),
  circular: RPG_TOWN_SURFACES.filter(({ shape }) => shape === "circle")
} as const;

export const RPG_RENDERED_RICH_LANDMARKS = RPG_LANDMARKS.filter(
  (landmark) => getRpgLandmarkRenderTier(landmark) === "rich"
);

export interface RpgTownRenderGroupStat {
  readonly id: string;
  readonly drawUnits: number;
  readonly triangleCount: number;
}

export interface RpgTownRenderStats {
  readonly groups: readonly RpgTownRenderGroupStat[];
  readonly drawUnits: number;
  readonly triangleCount: number;
}

const TRIANGLES_PER_ARCHITECTURE_GEOMETRY: Record<
  RpgTownBatchGeometry,
  number
> = {
  box: 12,
  cone4: 8,
  cylinder7: 28,
  cylinder8: 32,
  icosahedron1: 80
};

function includeGroup(
  id: string,
  drawUnits: number,
  triangleCount: number
): RpgTownRenderGroupStat[] {
  return drawUnits > 0 && triangleCount > 0
    ? [{ id, drawUnits, triangleCount }]
    : [];
}

function getSurfaceStats(): RpgTownRenderGroupStat[] {
  const groups = RPG_RENDERED_SURFACE_GROUPS;
  return [
    ...includeGroup(
      "surface-water",
      groups.rectangularWater.length > 0 ? 1 : 0,
      groups.rectangularWater.length * 12
    ),
    ...includeGroup(
      "surface-land",
      groups.rectangularLand.length > 0 ? 1 : 0,
      groups.rectangularLand.length * 12
    ),
    ...includeGroup(
      "surface-circles",
      groups.circular.length > 0 ? 1 : 0,
      groups.circular.length * 192
    ),
    { id: "surface-canal", drawUnits: 1, triangleCount: 12 },
    {
      id: "surface-bridge",
      drawUnits: 1,
      triangleCount: RPG_BRIDGE_DECK_SEGMENT_COUNT * 12
    }
  ];
}

function getSignatureStats(
  qualityLevel: SceneQualityLevel
): RpgTownRenderGroupStat[] {
  const count = (kind: (typeof RPG_RENDERED_RICH_LANDMARKS)[number]["kind"]) =>
    RPG_RENDERED_RICH_LANDMARKS.filter((landmark) => landmark.kind === kind)
      .length;
  const buildingCount =
    count("terminal") + count("tower") + count("machiya") + count("stall");
  const sakuraCrownCount = qualityLevel === "low" ? 3 : 5;
  const lanternCount = count("lantern");
  const toriiCount = count("torii");
  return [
    ...includeGroup(
      "signature-buildings",
      buildingCount * 5,
      buildingCount * 56
    ),
    ...includeGroup(
      "signature-sakura",
      count("sakuraTree") * (1 + sakuraCrownCount),
      count("sakuraTree") * (40 + sakuraCrownCount * 168)
    ),
    ...includeGroup("signature-canal", count("canal") > 0 ? 1 : 0, count("canal") * 24),
    ...includeGroup("signature-bridge", count("bridge") > 0 ? 2 : 0, count("bridge") * 8 * 12),
    ...includeGroup("signature-lantern-poles", lanternCount > 0 ? 1 : 0, lanternCount * 32),
    ...includeGroup("signature-lantern-lights", lanternCount > 0 ? 1 : 0, lanternCount * 48),
    ...includeGroup("signature-torii", toriiCount > 0 ? 1 : 0, toriiCount * 4 * 12)
  ];
}

function getDetailStats(): RpgTownRenderGroupStat[] {
  const shorelineCount =
    RPG_COASTAL_ROCK_DETAILS.length + RPG_COASTLINE_RING_ROCKS.length;
  const gyukatsuCount = RPG_GYUKATSU_OUTDOOR_DETAILS.length;
  return [
    { id: "details-shoreline", drawUnits: 1, triangleCount: shorelineCount * 36 },
    {
      id: "details-crosswalk",
      drawUnits: 1,
      triangleCount: (RPG_TOKYO_CROSSWALK_DETAILS.length + 1) * 12
    },
    {
      id: "details-furniture",
      drawUnits: 1,
      triangleCount: gyukatsuCount * 9 * 12
    },
    {
      id: "details-parasol-poles",
      drawUnits: 1,
      triangleCount: gyukatsuCount * 40
    },
    {
      id: "details-parasol-canopies",
      drawUnits: 1,
      triangleCount: gyukatsuCount * 24
    }
  ];
}

export function getRpgTownRenderStats(
  qualityLevel: SceneQualityLevel
): RpgTownRenderStats {
  const architecture = getRpgTownArchitectureBatchStats(qualityLevel)
    .filter(({ instanceCount }) => instanceCount > 0)
    .map((batch) => ({
      id: `architecture-${batch.id}`,
      drawUnits: 1,
      triangleCount:
        batch.instanceCount *
        TRIANGLES_PER_ARCHITECTURE_GEOMETRY[batch.geometry]
    }));
  const groups = [
    ...getSurfaceStats(),
    ...getSignatureStats(qualityLevel),
    ...architecture,
    ...getDetailStats()
  ];
  return {
    groups,
    drawUnits: groups.reduce((sum, group) => sum + group.drawUnits, 0),
    triangleCount: groups.reduce((sum, group) => sum + group.triangleCount, 0)
  };
}

export const RPG_TOWN_RENDER_GROUP_IDS = getRpgTownRenderStats("high").groups.map(
  ({ id }) => id
);
