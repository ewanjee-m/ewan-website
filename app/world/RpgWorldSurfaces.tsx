"use client";

import { getSurfaceHeight } from "./RpgWorldGeometry";
import {
  RPG_TOWN_SURFACES,
  type RpgTownSurface
} from "./RpgTownSceneLayout";
import { RPG_WORLD_BRIDGE, RPG_WORLD_CANAL } from "./RpgWorldModel";

export interface RpgProceduralBatchStat {
  readonly id: string;
  readonly drawUnits: number;
  readonly triangleCount: number;
}

export interface RpgBridgeDeckSegment {
  readonly id: string;
  readonly startX: number;
  readonly endX: number;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotationZ: number;
}

export function resolveRpgSurfaceMeshPosition(
  surface: Readonly<RpgTownSurface>
): readonly [number, number, number] {
  if (surface.kind === "water") return surface.position;
  const [x, , z] = surface.position;
  return [x, getSurfaceHeight([x, z]) + 0.002 - surface.size[1] / 2, z];
}

export function createRpgBridgeDeckSegments(
  segmentCount: number
): RpgBridgeDeckSegment[] {
  const minimumX = Math.min(...RPG_WORLD_BRIDGE.polygon.map(([x]) => x));
  const maximumX = Math.max(...RPG_WORLD_BRIDGE.polygon.map(([x]) => x));
  const z = (RPG_WORLD_BRIDGE.polygon[0][1] + RPG_WORLD_BRIDGE.polygon[2][1]) / 2;
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
      size: [Math.hypot(width, endHeight - startHeight) + 0.006, 0.08, 2],
      rotationZ
    };
  });
}

const bridgeSegments = createRpgBridgeDeckSegments(24);
export const RPG_WORLD_SURFACE_BATCH_STATS: readonly RpgProceduralBatchStat[] = [
  {
    id: "authored-surfaces",
    drawUnits: RPG_TOWN_SURFACES.length,
    triangleCount: RPG_TOWN_SURFACES.reduce(
      (sum, surface) => sum + (surface.shape === "circle" ? 192 : 12),
      0
    )
  },
  { id: "canal-water", drawUnits: 1, triangleCount: 12 },
  {
    id: "arched-bridge-deck",
    drawUnits: bridgeSegments.length,
    triangleCount: bridgeSegments.length * 12
  }
] as const;

export function RpgWorldSurfaces() {
  return (
    <group name="rpg-world-surfaces">
      {RPG_TOWN_SURFACES.filter(
        ({ id }) => id !== RPG_WORLD_BRIDGE.id && id !== RPG_WORLD_CANAL.id
      ).map((surface) => (
        <mesh
          key={surface.id}
          position={resolveRpgSurfaceMeshPosition(surface)}
          receiveShadow
          userData={{ surfaceId: surface.id, surfaceKind: surface.kind }}
        >
          {surface.shape === "circle" ? (
            <cylinderGeometry args={[surface.size[0] / 2, surface.size[0] / 2, surface.size[1], 48]} />
          ) : (
            <boxGeometry args={surface.size} />
          )}
          <meshStandardMaterial
            color={surface.color}
            roughness={surface.kind === "water" ? 0.28 : 0.92}
            metalness={surface.kind === "water" ? 0.08 : 0}
          />
        </mesh>
      ))}
      <mesh
        position={[
          (RPG_WORLD_CANAL.polygon[0][0] + RPG_WORLD_CANAL.polygon[1][0]) / 2,
          RPG_WORLD_CANAL.waterLevel,
          0
        ]}
        userData={{ surfaceId: RPG_WORLD_CANAL.id }}
      >
        <boxGeometry args={[2.2, 0.3, 72]} />
        <meshStandardMaterial color="#398aa2" roughness={0.24} />
      </mesh>
      {bridgeSegments.map((segment) => (
        <mesh
          key={segment.id}
          position={segment.position}
          rotation={[0, 0, segment.rotationZ]}
          userData={{ surfaceId: RPG_WORLD_BRIDGE.id }}
        >
          <boxGeometry args={segment.size} />
          <meshStandardMaterial color="#ac4a3d" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}
