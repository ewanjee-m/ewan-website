"use client";

import { Instance, Instances } from "@react-three/drei";
import { getSurfaceHeight } from "./RpgWorldGeometry";
import {
  RPG_TOWN_SURFACES,
  type RpgTownSurface
} from "./RpgTownSceneLayout";
import { RPG_WORLD_BRIDGE, RPG_WORLD_CANAL } from "./RpgWorldModel";
import {
  RPG_BRIDGE_DECK_SEGMENT_COUNT,
  RPG_RENDERED_SURFACE_GROUPS
} from "./RpgTownRenderStats";

export interface RpgBridgeDeckSegment {
  readonly id: string;
  readonly startX: number;
  readonly endX: number;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotationZ: number;
}

/**
 * Every land surface used to be pinned to `getSurfaceHeight + 0.002`, so the
 * meadow, the aprons, the roads and the sidewalks all rendered their top face
 * on one plane. Four of them overlap at the spawn point, which produced the
 * grey stipple and the green bleed-through. Each surface now gets its own
 * depth slot: kinds stack in walk order, and surfaces inside one kind are
 * ranked by the authored height the old code threw away.
 */
export const RPG_SURFACE_LAYER_LIFT = 0.002;
export const RPG_SURFACE_LAYER_STEP = 0.0008;
/**
 * The sea used to render its top at -0.55 while the land sat at 0.002, so the
 * meadow showed a 55 cm vertical wall all round the world edge. Lifting the
 * rendered waterline leaves a shoreline lip instead of a cliff.
 */
export const RPG_SURFACE_WATER_TOP = -0.09;

const SURFACE_KIND_ORDER: Record<RpgTownSurface["kind"], number> = {
  water: 0,
  ground: 1,
  plaza: 2,
  road: 3,
  sidewalk: 4
};

const authoredTop = (surface: Readonly<RpgTownSurface>) =>
  surface.position[1] + surface.size[1] / 2;

const SURFACE_LAYER_OFFSETS: ReadonlyMap<string, number> = new Map(
  RPG_TOWN_SURFACES.filter(({ kind }) => kind !== "water")
    .slice()
    .sort(
      (first, second) =>
        SURFACE_KIND_ORDER[first.kind] - SURFACE_KIND_ORDER[second.kind] ||
        authoredTop(first) - authoredTop(second) ||
        (first.id < second.id ? -1 : 1)
    )
    .map((surface, index) => [
      surface.id,
      index * RPG_SURFACE_LAYER_STEP
    ] as const)
);

export function resolveRpgSurfaceMeshPosition(
  surface: Readonly<RpgTownSurface>
): readonly [number, number, number] {
  const [x, , z] = surface.position;
  if (surface.kind === "water") {
    return [x, RPG_SURFACE_WATER_TOP - surface.size[1] / 2, z];
  }
  const top =
    getSurfaceHeight([x, z]) +
    RPG_SURFACE_LAYER_LIFT +
    (SURFACE_LAYER_OFFSETS.get(surface.id) ?? 0);
  return [x, top - surface.size[1] / 2, z];
}

export function createRpgBridgeDeckSegments(
  segmentCount: number
): RpgBridgeDeckSegment[] {
  const minimumX = Math.min(...RPG_WORLD_BRIDGE.polygon.map(([x]) => x));
  const maximumX = Math.max(...RPG_WORLD_BRIDGE.polygon.map(([x]) => x));
  const z = (RPG_WORLD_BRIDGE.polygon[0][1] + RPG_WORLD_BRIDGE.polygon[2][1]) / 2;
  // Read off the deck rather than written down, so a visitor never walks on a
  // strip of crossing that has no bridge drawn under it.
  const depth =
    Math.max(...RPG_WORLD_BRIDGE.polygon.map(([, value]) => value)) -
    Math.min(...RPG_WORLD_BRIDGE.polygon.map(([, value]) => value));
  const width = (maximumX - minimumX) / segmentCount;
  return Array.from({ length: segmentCount }, (_, index) => {
    const startX = minimumX + index * width;
    const endX = startX + width;
    const startHeight = getSurfaceHeight([startX, z]);
    const endHeight = getSurfaceHeight([endX, z]);
    const rotationZ = Math.atan2(endHeight - startHeight, endX - startX);
    return {
      id: `sakura-bridge-deck-${index}`,
      startX,
      endX,
      position: [
        (startX + endX) / 2,
        (startHeight + endHeight) / 2 - 0.04,
        z
      ],
      size: [Math.hypot(width, endHeight - startHeight) + 0.006, 0.08, depth],
      rotationZ
    };
  });
}

const bridgeSegments = createRpgBridgeDeckSegments(
  RPG_BRIDGE_DECK_SEGMENT_COUNT
);

export function RpgWorldSurfaces() {
  return (
    <group name="rpg-world-surfaces">
      <Instances
        limit={RPG_RENDERED_SURFACE_GROUPS.rectangularWater.length}
        frames={1}
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.28} metalness={0.08} />
        {RPG_RENDERED_SURFACE_GROUPS.rectangularWater.map((surface) => (
          <Instance
            key={surface.id}
            position={resolveRpgSurfaceMeshPosition(surface)}
            scale={surface.size}
            color={surface.color}
            userData={{ surfaceId: surface.id, surfaceKind: surface.kind }}
          />
        ))}
      </Instances>
      <Instances
        limit={RPG_RENDERED_SURFACE_GROUPS.rectangularLand.length}
        frames={1}
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.92} />
        {RPG_RENDERED_SURFACE_GROUPS.rectangularLand.map((surface) => (
          <Instance
            key={surface.id}
            position={resolveRpgSurfaceMeshPosition(surface)}
            scale={surface.size}
            color={surface.color}
            userData={{ surfaceId: surface.id, surfaceKind: surface.kind }}
          />
        ))}
      </Instances>
      <Instances
        limit={RPG_RENDERED_SURFACE_GROUPS.circular.length}
        frames={1}
        receiveShadow
      >
        <cylinderGeometry args={[1, 1, 1, 48]} />
        <meshStandardMaterial color="#ffffff" roughness={0.92} />
        {RPG_RENDERED_SURFACE_GROUPS.circular.map((surface) => (
          <Instance
            key={surface.id}
            position={resolveRpgSurfaceMeshPosition(surface)}
            scale={[surface.size[0] / 2, surface.size[1], surface.size[2] / 2]}
            color={surface.color}
            userData={{ surfaceId: surface.id, surfaceKind: surface.kind }}
          />
        ))}
      </Instances>
      <Instances limit={1} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#398aa2" roughness={0.24} />
        <Instance
          position={[
            (RPG_WORLD_CANAL.polygon[0][0] + RPG_WORLD_CANAL.polygon[1][0]) / 2,
            RPG_WORLD_CANAL.waterLevel,
            0
          ]}
          scale={[2.2, 0.3, 72]}
          userData={{ surfaceId: RPG_WORLD_CANAL.id }}
        />
      </Instances>
      <Instances limit={bridgeSegments.length} frames={1} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ac4a3d" roughness={0.82} />
        {bridgeSegments.map((segment) => (
          <Instance
            key={segment.id}
            position={segment.position}
            rotation={[0, 0, segment.rotationZ]}
            scale={segment.size}
            userData={{ surfaceId: RPG_WORLD_BRIDGE.id }}
          />
        ))}
      </Instances>
    </group>
  );
}
