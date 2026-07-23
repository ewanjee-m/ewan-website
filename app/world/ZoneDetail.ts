import type { SceneQualityLevel } from "./SceneQuality";

interface PositionLike {
  x: number;
  y: number;
  z: number;
}

const ZONE_COUNT = 6;
const ZONE_ANGLE = (Math.PI * 2) / ZONE_COUNT;
const ACTIVE_NEIGHBORS_BY_QUALITY: Record<SceneQualityLevel, number> = {
  high: 1,
  medium: 1,
  low: 1
};

function normalizedZoneIndex(angle: number) {
  const index = Math.round(angle / ZONE_ANGLE);
  return ((index % ZONE_COUNT) + ZONE_COUNT) % ZONE_COUNT;
}

export function isZoneDetailed(
  playerPosition: PositionLike,
  zoneAngle: number,
  qualityLevel: SceneQualityLevel
) {
  const playerAngle = Math.atan2(-playerPosition.z, playerPosition.y);
  const playerZone = normalizedZoneIndex(playerAngle);
  const landmarkZone = normalizedZoneIndex(zoneAngle);
  const directDistance = Math.abs(playerZone - landmarkZone);
  const zoneDistance = Math.min(
    directDistance,
    ZONE_COUNT - directDistance
  );
  return zoneDistance <= ACTIVE_NEIGHBORS_BY_QUALITY[qualityLevel];
}
