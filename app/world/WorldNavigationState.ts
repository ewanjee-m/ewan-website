import type { DestinationId } from "../guide/GuideContract";
import {
  getNavigationRegionAt,
  getSurfaceHeight,
  getSurfaceNormal,
  type NavigationRegion
} from "./RpgWorldGeometry";
import { RPG_WORLD_SPAWN, type WorldPoint3 } from "./RpgWorldModel";

export type WorldLocomotion = "idle" | "walk" | "run" | "jump";

export interface WorldNavigationSnapshot {
  readonly revision: number;
  readonly position: WorldPoint3;
  readonly surfaceHeight: number;
  readonly jumpOffset: number;
  readonly surfaceNormal: WorldPoint3;
  readonly heading: WorldPoint3;
  readonly moving: boolean;
  readonly grounded: boolean;
  readonly locomotion: WorldLocomotion;
  readonly navigationRegion: NavigationRegion;
  readonly navigationRegionId: string;
  readonly transitionProgress: number | null;
  readonly currentZoneId: DestinationId;
  readonly highlightedZoneIds: readonly DestinationId[];
  readonly nearInteractionId: string | null;
}

export function createInitialWorldNavigationSnapshot(): WorldNavigationSnapshot {
  const navigationRegion = getNavigationRegionAt(RPG_WORLD_SPAWN)!;
  return Object.freeze({
    revision: 0,
    position: Object.freeze([...RPG_WORLD_SPAWN] as WorldPoint3),
    surfaceHeight: getSurfaceHeight(RPG_WORLD_SPAWN),
    jumpOffset: 0,
    surfaceNormal: Object.freeze(getSurfaceNormal(RPG_WORLD_SPAWN)),
    heading: Object.freeze([1, 0, 0] as const),
    moving: false,
    grounded: true,
    locomotion: "idle",
    navigationRegion,
    navigationRegionId: navigationRegion.regionId,
    transitionProgress: null,
    currentZoneId: navigationRegion.displayZoneId,
    highlightedZoneIds: navigationRegion.highlightedZoneIds,
    nearInteractionId: null
  });
}
