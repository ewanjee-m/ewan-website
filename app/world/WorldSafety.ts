export const WORLD_RADIUS = 12.08;
export const WORLD_PATH_WIDTH = 2.9;
export const PLAYER_COLLISION_RADIUS = 0.42;
export const SAFE_CORRIDOR_HALF_WIDTH =
  WORLD_PATH_WIDTH / 2 - PLAYER_COLLISION_RADIUS;
export const BUS_LANE_CENTER_OFFSET = 2.65;
export const BUS_COLLISION_HALF_WIDTH = 1.08;
export const AIRPORT_BUS_HALF_LENGTH = 4.45 / 2;
export const AIRPORT_BUS_STATION_ROUTE_PROGRESS = 0.4;
export const AIRPORT_CROSSWALK_ROUTE_PROGRESS = 0.3;
export const AIRPORT_BUS_CROSSWALK_STOP_ROUTE_PROGRESS = 0.245;
export const AIRPORT_CROSSWALK_TRACK_ANGLE =
  (AIRPORT_CROSSWALK_ROUTE_PROGRESS - AIRPORT_BUS_STATION_ROUTE_PROGRESS) *
  Math.PI *
  2;
export const AIRPORT_CROSSWALK_HALF_LENGTH = 1.3;
const AIRPORT_BUS_ROUTE_RADIUS =
  WORLD_RADIUS * Math.cos(BUS_LANE_CENTER_OFFSET / WORLD_RADIUS);
export const AIRPORT_BUS_CROSSWALK_COLLISION_ENTRY_ROUTE_PROGRESS =
  AIRPORT_CROSSWALK_ROUTE_PROGRESS -
  (AIRPORT_BUS_HALF_LENGTH +
    AIRPORT_CROSSWALK_HALF_LENGTH +
    PLAYER_COLLISION_RADIUS) /
    (Math.PI * 2 * AIRPORT_BUS_ROUTE_RADIUS);

interface PositionLike {
  x: number;
  y: number;
  z: number;
}

export function isPlayerInAirportCrosswalk(position: PositionLike) {
  const radius = Math.hypot(position.x, position.y, position.z);
  if (!Number.isFinite(radius) || radius <= 0) {
    return false;
  }
  const trackAngle = Math.atan2(-position.z, position.y);
  const longitudinalDistance =
    Math.abs(
      Math.atan2(
        Math.sin(trackAngle - AIRPORT_CROSSWALK_TRACK_ANGLE),
        Math.cos(trackAngle - AIRPORT_CROSSWALK_TRACK_ANGLE)
      )
    ) * radius;
  const lateralDistance =
    Math.asin(Math.min(1, Math.max(-1, position.x / radius))) * radius;

  return (
    longitudinalDistance <= AIRPORT_CROSSWALK_HALF_LENGTH &&
    lateralDistance >= -BUS_LANE_CENTER_OFFSET - PLAYER_COLLISION_RADIUS &&
    lateralDistance <= SAFE_CORRIDOR_HALF_WIDTH + PLAYER_COLLISION_RADIUS
  );
}
