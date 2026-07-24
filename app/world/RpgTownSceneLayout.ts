import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_WORLD_BOUNDS,
  RPG_WORLD_BRIDGE,
  RPG_WORLD_CANAL,
  RPG_WORLD_CANAL_WATER_LEVEL,
  RPG_PLAYER_COLLISION_RADIUS as CANONICAL_PLAYER_COLLISION_RADIUS,
  RPG_WORLD_ROUTES,
  RPG_WORLD_SCENE_LANDMARKS,
  RPG_WORLD_SCENE_SURFACES,
  RPG_WORLD_ZONES
} from "./RpgWorldModel";
import { getSurfaceHeight, isWalkable } from "./RpgWorldGeometry";

export interface RpgTownBounds {
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}

export interface RpgTownZone {
  id: DestinationId;
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
  centerX: number;
  centerZ: number;
  groundColor: string;
}

export interface RpgWalkRectangle {
  id: string;
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
  surface: "road" | "bridge";
}

export interface RpgTownSurface {
  id: string;
  kind: "ground" | "water" | "road" | "sidewalk" | "plaza";
  shape?: "rectangle" | "circle";
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
  accent?: string;
}

export type RpgLandmarkKind =
  | "terminal"
  | "bus"
  | "tower"
  | "machiya"
  | "sakuraTree"
  | "canal"
  | "bridge"
  | "stall"
  | "lantern"
  | "torii"
  | "npc"
  | "hanabi";

export interface RpgLandmark {
  id: string;
  kind: RpgLandmarkKind;
  zoneId: DestinationId;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
  accent: string;
  blocksMovement: boolean;
  rotationY?: number;
  variant?: number;
  navigationRegionId?: string;
  collisionPadding?: readonly [number, number];
}

export const RPG_TOWN_BOUNDS: RpgTownBounds = RPG_WORLD_BOUNDS;

const RPG_ZONE_COLORS: Record<DestinationId, string> = {
  airport: "#80927a",
  tokyo: "#687b79",
  gyukatsu: "#7f8c68",
  sakura: "#7f906c",
  hanabi: "#6e7f67"
};

export const RPG_TOWN_ZONES: readonly RpgTownZone[] = RPG_WORLD_ZONES.map((zone) => {
  const xs = zone.displayPolygon.map(([x]) => x);
  const zs = zone.displayPolygon.map(([, z]) => z);
  return {
    id: zone.id,
    minimumX: Math.min(...xs),
    maximumX: Math.max(...xs),
    minimumZ: Math.min(...zs),
    maximumZ: Math.max(...zs),
    centerX: zone.cameraAnchor[0],
    centerZ: zone.cameraAnchor[1],
    groundColor: RPG_ZONE_COLORS[zone.id]
  };
});

const BRIDGE_CENTER_X = (RPG_WORLD_BRIDGE.polygon[0][0] + RPG_WORLD_BRIDGE.polygon[1][0]) / 2;

export const RPG_BRIDGE_ARCH_RISE = RPG_WORLD_BRIDGE.archRise;

export const RPG_MAIN_ROUTE: readonly RpgWalkRectangle[] = RPG_WORLD_ROUTES.map((route) => {
  const xs = route.polygon.map(([x]) => x);
  const zs = route.polygon.map(([, z]) => z);
  return {
    id: route.id,
    minimumX: Math.min(...xs),
    maximumX: Math.max(...xs),
    minimumZ: Math.min(...zs),
    maximumZ: Math.max(...zs),
    surface: route.surface
  };
});

export const RPG_BRIDGE_CROSSING = {
  canalId: RPG_WORLD_CANAL.id,
  bridgeId: RPG_WORLD_BRIDGE.id,
  routeId: RPG_WORLD_BRIDGE.routeId
} as const;

const CANAL_WIDTH = RPG_WORLD_CANAL.polygon[1][0] - RPG_WORLD_CANAL.polygon[0][0];
export const CANAL_WEST_BANK_X = BRIDGE_CENTER_X - CANAL_WIDTH / 2;
export const CANAL_EAST_BANK_X = BRIDGE_CENTER_X + CANAL_WIDTH / 2;
export const RPG_CANAL_WATER_LEVEL = RPG_WORLD_CANAL_WATER_LEVEL;

export const RPG_TOWN_SURFACES: readonly RpgTownSurface[] =
  RPG_WORLD_SCENE_SURFACES.map((surface) => ({ ...surface }));

export const RPG_LANDMARKS: readonly RpgLandmark[] =
  RPG_WORLD_SCENE_LANDMARKS.map((landmark) => ({ ...landmark }));

interface AxisAlignedRectangle {
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}

export function rectanglesTouchOrOverlap(
  first: AxisAlignedRectangle,
  second: AxisAlignedRectangle,
  tolerance = 0.001
): boolean {
  return !(
    first.maximumX + tolerance < second.minimumX ||
    first.minimumX - tolerance > second.maximumX ||
    first.maximumZ + tolerance < second.minimumZ ||
    first.minimumZ - tolerance > second.maximumZ
  );
}

export const RPG_PLAYER_COLLISION_RADIUS = CANONICAL_PLAYER_COLLISION_RADIUS;

export function isRpgWalkablePosition(x: number, z: number): boolean {
  return isWalkable([x, z]);
}

export function getRpgWalkSurfaceHeight(x: number, z: number): number {
  return getSurfaceHeight([x, z]);
}
