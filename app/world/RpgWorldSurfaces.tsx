"use client";

import { Instance, Instances } from "@react-three/drei";
import { getSurfaceHeight } from "./RpgWorldGeometry";
import {
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
