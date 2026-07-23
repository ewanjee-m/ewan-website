import {
  getNavigationRegionAt,
  isWalkable,
  projectWorldToReference
} from "./RpgWorldGeometry";
import {
  RPG_PLAYER_COLLISION_RADIUS,
  RPG_WORLD_BRIDGE,
  RPG_WORLD_LANDMARKS,
  type WorldPoint2,
  type WorldPoint3
} from "./RpgWorldModel";

export const RPG_WORLD_DEPTH_BAND_IDS = [
  "airport-shelter-planter",
  "sakura-bridge",
  "sakura-tree-01",
  "district-volume-tokyo-corner-tower",
  "hanabi-rail-post"
] as const;

export type RpgWorldDepthBandId = (typeof RPG_WORLD_DEPTH_BAND_IDS)[number];
export type RpgWorldDepthCrossing = "front" | "behind";

type ReferenceProjection = NonNullable<
  ReturnType<typeof projectWorldToReference>
>;

export interface RpgWorldReferenceMask {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
  readonly behindEdgeY: number;
  readonly frontEdgeY: number;
}

export interface RpgWorldDepthBandFixture {
  readonly id: RpgWorldDepthBandId;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  /** Projection-derived depth of the actual foreground occluder. */
  readonly depthKey: number;
  readonly kind: (typeof RPG_WORLD_LANDMARKS)[number]["kind"];
  readonly color: string;
  readonly accent: string;
  readonly crossingWorldBounds: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumZ: number;
    readonly maximumZ: number;
  };
  readonly referenceMask: RpgWorldReferenceMask;
  readonly occlusionAnchor: {
    readonly pixel: readonly [number, number];
    readonly depthKey: number;
  };
  readonly referenceSamples: readonly {
    readonly worldXZ: WorldPoint2;
    readonly pixel: readonly [number, number];
    readonly depthKey: number;
  }[];
}

export interface RpgWorldDepthBandOutcome {
  readonly activeBand: RpgWorldDepthBandId;
  readonly crossing: RpgWorldDepthCrossing;
  readonly playerRenderOrder: number;
  readonly foregroundRenderOrder: number;
}

export interface RpgWorldDepthResolution {
  readonly projection: ReferenceProjection;
  readonly activeBand: RpgWorldDepthBandId | null;
  readonly crossing: RpgWorldDepthCrossing | null;
  readonly playerRenderOrder: number;
  readonly foregroundRenderOrder: number;
}

const RENDER_ORDER_RANGE = 10_000;
const CROSSING_CLEARANCE = RPG_PLAYER_COLLISION_RADIUS + 0.2;
const REFERENCE_EPSILON = 1e-6;

function isDepthBandId(id: string): id is RpgWorldDepthBandId {
  return RPG_WORLD_DEPTH_BAND_IDS.some((candidate) => candidate === id);
}

function worldPoint(position: WorldPoint2 | WorldPoint3): WorldPoint2 {
  return position.length === 3
    ? [position[0], position[2]]
    : position;
}

function hasFinitePosition(position: WorldPoint2 | WorldPoint3) {
  return position.every(Number.isFinite);
}

function projectWalkablePlayerPosition(
  position: WorldPoint2 | WorldPoint3
): ReferenceProjection | null {
  if (!hasFinitePosition(position) || !isWalkable(position)) return null;
  return projectWorldToReference(position);
}

function projectedSamples(
  worldXZ: readonly WorldPoint2[]
): RpgWorldDepthBandFixture["referenceSamples"] | null {
  const samples = worldXZ.map((point) => {
    const projection = projectWorldToReference(point);
    return projection
      ? {
          worldXZ: point,
          pixel: projection.pixel,
          depthKey: projection.depthKey
        }
      : null;
  });
  if (samples.some((sample) => sample === null)) return null;
  return samples as RpgWorldDepthBandFixture["referenceSamples"];
}

function canonicalFixture(
  landmark: (typeof RPG_WORLD_LANDMARKS)[number] & {
    readonly id: RpgWorldDepthBandId;
  }
): RpgWorldDepthBandFixture | null {
  const [centerX, , centerZ] = landmark.position;
  const halfWidth = landmark.size[0] / 2;
  const halfDepth = landmark.size[2] / 2;
  const minimumX =
    landmark.id === "sakura-bridge"
      ? Math.min(...RPG_WORLD_BRIDGE.polygon.map(([x]) => x))
      : centerX - halfWidth;
  const maximumX =
    landmark.id === "sakura-bridge"
      ? Math.max(...RPG_WORLD_BRIDGE.polygon.map(([x]) => x))
      : centerX + halfWidth;
  const bridgeMinimumZ = Math.min(
    ...RPG_WORLD_BRIDGE.polygon.map(([, z]) => z)
  );
  const bridgeMaximumZ = Math.max(
    ...RPG_WORLD_BRIDGE.polygon.map(([, z]) => z)
  );
  const behindZ =
    landmark.id === "sakura-bridge"
      ? centerZ + halfDepth / 2
      : centerZ + halfDepth + CROSSING_CLEARANCE;
  const frontZ =
    landmark.id === "sakura-bridge"
      ? centerZ - halfDepth / 2
      : centerZ - halfDepth - CROSSING_CLEARANCE;
  const xSamples = [minimumX, centerX, maximumX] as const;
  const sampleWorldXZ = [
    ...xSamples.map((x) => [x, behindZ] as const),
    ...xSamples.map((x) => [x, frontZ] as const)
  ];
  const referenceSamples = projectedSamples(sampleWorldXZ);
  if (!referenceSamples) return null;

  const behindCenter = referenceSamples[1];
  const frontCenter = referenceSamples[4];
  const canonicalAnchor = projectWorldToReference([centerX, centerZ]);
  const occlusionAnchor = canonicalAnchor
    ? {
        pixel: canonicalAnchor.pixel,
        depthKey: canonicalAnchor.depthKey
      }
    : {
        pixel: [
          (behindCenter.pixel[0] + frontCenter.pixel[0]) / 2,
          (behindCenter.pixel[1] + frontCenter.pixel[1]) / 2
        ] as const,
        depthKey: (behindCenter.depthKey + frontCenter.depthKey) / 2
      };
  const pixelXs = referenceSamples.map(({ pixel }) => pixel[0]);
  const pixelYs = referenceSamples.map(({ pixel }) => pixel[1]);

  return {
    id: landmark.id,
    position: landmark.position,
    size: landmark.size,
    depthKey: occlusionAnchor.depthKey,
    kind: landmark.kind,
    color: landmark.color,
    accent: landmark.accent,
    crossingWorldBounds: {
      minimumX,
      maximumX,
      minimumZ:
        landmark.id === "sakura-bridge" ? bridgeMinimumZ : frontZ,
      maximumZ:
        landmark.id === "sakura-bridge" ? bridgeMaximumZ : behindZ
    },
    referenceMask: {
      minimumX: Math.min(...pixelXs),
      maximumX: Math.max(...pixelXs),
      minimumY: Math.min(...pixelYs),
      maximumY: Math.max(...pixelYs),
      behindEdgeY: behindCenter.pixel[1],
      frontEdgeY: frontCenter.pixel[1]
    },
    occlusionAnchor,
    referenceSamples
  };
}

export const RPG_WORLD_DEPTH_BAND_FIXTURES = RPG_WORLD_LANDMARKS.flatMap(
  (landmark) => {
    if (!isDepthBandId(landmark.id)) return [];
    const fixture = canonicalFixture(
      landmark as (typeof landmark) & { readonly id: RpgWorldDepthBandId }
    );
    return fixture ? [fixture] : [];
  }
).sort(
  (left, right) =>
    RPG_WORLD_DEPTH_BAND_IDS.indexOf(left.id) -
    RPG_WORLD_DEPTH_BAND_IDS.indexOf(right.id)
);

function playerOrder(depthKey: number) {
  return Math.round(depthKey * RENDER_ORDER_RANGE);
}

function isWithinFixtureCrossing(
  fixture: RpgWorldDepthBandFixture,
  position: WorldPoint2 | WorldPoint3,
  projection: ReferenceProjection
) {
  const [x, z] = worldPoint(position);
  const world = fixture.crossingWorldBounds;
  const reference = fixture.referenceMask;
  return (
    x >= world.minimumX - REFERENCE_EPSILON &&
    x <= world.maximumX + REFERENCE_EPSILON &&
    z >= world.minimumZ - REFERENCE_EPSILON &&
    z <= world.maximumZ + REFERENCE_EPSILON &&
    projection.pixel[0] >= reference.minimumX - REFERENCE_EPSILON &&
    projection.pixel[0] <= reference.maximumX + REFERENCE_EPSILON &&
    projection.pixel[1] >= reference.minimumY - REFERENCE_EPSILON &&
    projection.pixel[1] <= reference.maximumY + REFERENCE_EPSILON
  );
}

function outcomeForProjection(
  fixture: RpgWorldDepthBandFixture,
  position: WorldPoint2 | WorldPoint3,
  projection: ReferenceProjection
): RpgWorldDepthBandOutcome | null {
  if (!isWithinFixtureCrossing(fixture, position, projection)) return null;
  const crossing: RpgWorldDepthCrossing =
    projection.depthKey >= fixture.depthKey ? "front" : "behind";
  const baseOrder = playerOrder(projection.depthKey);
  return {
    activeBand: fixture.id,
    crossing,
    playerRenderOrder: baseOrder + (crossing === "front" ? 1 : 0),
    foregroundRenderOrder: baseOrder + (crossing === "behind" ? 1 : 0)
  };
}

function approvedReferenceForegroundOutcome(
  position: WorldPoint2 | WorldPoint3,
  projection: ReferenceProjection
): RpgWorldDepthBandOutcome | null {
  const region = getNavigationRegionAt(worldPoint(position));
  if (!region || region.kind !== "zone") return null;
  const [pixelX, pixelY] = projection.pixel;
  const baseOrder = playerOrder(projection.depthKey);
  if (
    region.displayZoneId === "airport" &&
    pixelX >= 380 &&
    pixelX <= 560 &&
    pixelY >= 500 &&
    pixelY <= 675
  ) {
    const crossing = pixelY <= 650 ? "behind" : "front";
    return {
      activeBand: "airport-shelter-planter",
      crossing,
      playerRenderOrder: baseOrder + (crossing === "front" ? 1 : 0),
      foregroundRenderOrder: baseOrder + (crossing === "behind" ? 1 : 0)
    };
  }
  if (
    region.displayZoneId === "hanabi" &&
    pixelX >= 1470 &&
    pixelX <= 1645 &&
    pixelY >= 430 &&
    pixelY <= 675
  ) {
    const crossing = pixelY <= 650 ? "behind" : "front";
    return {
      activeBand: "hanabi-rail-post",
      crossing,
      playerRenderOrder: baseOrder + (crossing === "front" ? 1 : 0),
      foregroundRenderOrder: baseOrder + (crossing === "behind" ? 1 : 0)
    };
  }
  return null;
}

export function getRpgWorldDepthBandOutcome(
  id: RpgWorldDepthBandId,
  position: WorldPoint2 | WorldPoint3
): RpgWorldDepthBandOutcome | null {
  const projection = projectWalkablePlayerPosition(position);
  const fixture = RPG_WORLD_DEPTH_BAND_FIXTURES.find(
    (candidate) => candidate.id === id
  );
  if (!projection) return null;
  if (
    id === "airport-shelter-planter" ||
    id === "hanabi-rail-post"
  ) {
    const approved = approvedReferenceForegroundOutcome(position, projection);
    return approved?.activeBand === id ? approved : null;
  }
  return fixture ? outcomeForProjection(fixture, position, projection) : null;
}

export function resolveRpgWorldDepthBands(
  position: WorldPoint2 | WorldPoint3
): RpgWorldDepthResolution | null {
  const projection = projectWalkablePlayerPosition(position);
  if (!projection) return null;
  const approvedForeground = approvedReferenceForegroundOutcome(
    position,
    projection
  );
  if (approvedForeground) {
    return {
      projection,
      activeBand: approvedForeground.activeBand,
      crossing: approvedForeground.crossing,
      playerRenderOrder: approvedForeground.playerRenderOrder,
      foregroundRenderOrder: approvedForeground.foregroundRenderOrder
    };
  }
  const outcomes = RPG_WORLD_DEPTH_BAND_FIXTURES.flatMap((fixture) => {
    const outcome = outcomeForProjection(fixture, position, projection);
    return outcome ? [outcome] : [];
  });
  const active = outcomes.reduce<RpgWorldDepthBandOutcome | null>(
    (closest, candidate) => {
      if (!closest) return candidate;
      const closestFixture = RPG_WORLD_DEPTH_BAND_FIXTURES.find(
        ({ id }) => id === closest.activeBand
      )!;
      const candidateFixture = RPG_WORLD_DEPTH_BAND_FIXTURES.find(
        ({ id }) => id === candidate.activeBand
      )!;
      return Math.abs(candidateFixture.depthKey - projection.depthKey) <
        Math.abs(closestFixture.depthKey - projection.depthKey)
        ? candidate
        : closest;
    },
    null
  );
  const baseOrder = playerOrder(projection.depthKey);
  return {
    projection,
    activeBand: active?.activeBand ?? null,
    crossing: active?.crossing ?? null,
    playerRenderOrder: active?.playerRenderOrder ?? baseOrder,
    foregroundRenderOrder: active?.foregroundRenderOrder ?? baseOrder
  };
}
