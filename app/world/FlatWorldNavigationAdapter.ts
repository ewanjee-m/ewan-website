import {
  getSurfaceHeight,
  getSurfaceNormal
} from "./RpgWorldGeometry";
import type { FlatWorldNavigationSnapshot } from "./FlatWorldSession";
import type { WorldPoint3 } from "./RpgWorldModel";
import {
  freezeWorldNavigationRegion,
  type WorldNavigationSnapshot
} from "./WorldNavigationState";

export function adaptFlatWorldNavigationSnapshot(
  flat: FlatWorldNavigationSnapshot
): WorldNavigationSnapshot {
  const surfaceHeight = getSurfaceHeight(flat.position);
  const jumpOffset = Math.max(0, flat.position[1]);
  const navigationRegion = freezeWorldNavigationRegion(flat.navigationRegion);
  return Object.freeze({
    revision: flat.revision,
    position: Object.freeze([
      flat.position[0],
      surfaceHeight + jumpOffset,
      flat.position[2]
    ] as const),
    surfaceHeight,
    jumpOffset,
    surfaceNormal: Object.freeze(getSurfaceNormal(flat.position)),
    heading: Object.freeze([...flat.heading] as WorldPoint3),
    moving: flat.moving,
    grounded: flat.grounded,
    locomotion: !flat.grounded
      ? "jump"
      : flat.moving
        ? "walk"
        : "idle",
    navigationRegion,
    navigationRegionId: navigationRegion.regionId,
    transitionProgress: flat.transitionProgress,
    currentZoneId: navigationRegion.displayZoneId,
    highlightedZoneIds: navigationRegion.highlightedZoneIds,
    nearInteractionId: null
  });
}
