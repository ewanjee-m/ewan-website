import {
  getSurfaceHeight,
  getSurfaceNormal
} from "./RpgWorldGeometry";
import type { FlatWorldNavigationSnapshot } from "./FlatWorldSession";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export function adaptFlatWorldNavigationSnapshot(
  flat: FlatWorldNavigationSnapshot
): WorldNavigationSnapshot {
  const surfaceHeight = getSurfaceHeight(flat.position);
  const jumpOffset = Math.max(0, flat.position[1]);
  return Object.freeze({
    revision: flat.revision,
    position: Object.freeze([
      flat.position[0],
      surfaceHeight + jumpOffset,
      flat.position[2]
    ] as const),
    surfaceHeight,
    jumpOffset,
    surfaceNormal: getSurfaceNormal(flat.position),
    heading: flat.heading,
    moving: flat.moving,
    grounded: flat.grounded,
    locomotion: !flat.grounded
      ? "jump"
      : flat.moving
        ? "walk"
        : "idle",
    navigationRegion: flat.navigationRegion,
    navigationRegionId: flat.navigationRegionId,
    transitionProgress: flat.transitionProgress,
    currentZoneId: flat.currentZoneId,
    highlightedZoneIds: flat.highlightedZoneIds,
    nearInteractionId: null
  });
}
