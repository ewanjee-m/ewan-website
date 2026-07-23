import type { DestinationId } from "./GuideContract";
import { getArrival, getNavigationRegionAt } from "../world/RpgWorldGeometry";
import { RPG_WORLD_BOUNDS } from "../world/RpgWorldModel";

export type GuideDirection = "straight" | "left" | "right" | "turnAround";
export type VectorTuple = [number, number, number];

export const FLAT_WORLD_HALF_WIDTH =
  (RPG_WORLD_BOUNDS.maximumX - RPG_WORLD_BOUNDS.minimumX) / 2;

export function getCurrentZoneId(position: VectorTuple): DestinationId {
  return getNavigationRegionAt(position)?.displayZoneId ?? "airport";
}

export function getDestinationPosition(
  destinationId: DestinationId,
  halfWidth = FLAT_WORLD_HALF_WIDTH
): VectorTuple {
  const arrival = getArrival(destinationId);
  const scale = halfWidth / FLAT_WORLD_HALF_WIDTH;
  return [arrival.position[0] * scale, arrival.position[1], arrival.position[2] * scale];
}

/**
 * Which way a visitor faces the moment fast travel sets them down. Arriving
 * kept whatever heading the visitor had before, so the festival street could
 * open with the fireworks behind their back and the airport with the terminal
 * out of frame. Each zone points at the thing that makes it that zone.
 */
export function getDestinationArrivalHeading(
  destinationId: DestinationId
): readonly [x: number, z: number] {
  return getArrival(destinationId).heading;
}

export function calculateGuideDirection({
  position,
  heading,
  destinationId
}: {
  position: VectorTuple;
  surfaceNormal: VectorTuple;
  heading: VectorTuple;
  destinationId: DestinationId;
}): GuideDirection {
  const destination = getDestinationPosition(destinationId);
  const desiredX = destination[0] - position[0];
  const desiredZ = destination[2] - position[2];
  const desiredLength = Math.hypot(desiredX, desiredZ);
  if (desiredLength < 1e-6) {
    return "straight";
  }

  const forwardLength = Math.hypot(heading[0], heading[2]);
  const forwardX = forwardLength > 0 ? heading[0] / forwardLength : 1;
  const forwardZ = forwardLength > 0 ? heading[2] / forwardLength : 0;
  const normalizedDesiredX = desiredX / desiredLength;
  const normalizedDesiredZ = desiredZ / desiredLength;
  const forwardAlignment =
    forwardX * normalizedDesiredX + forwardZ * normalizedDesiredZ;

  if (forwardAlignment >= Math.SQRT1_2) {
    return "straight";
  }
  if (forwardAlignment <= -Math.SQRT1_2) {
    return "turnAround";
  }

  const rightX = -forwardZ;
  const rightZ = forwardX;
  const rightAlignment =
    normalizedDesiredX * rightX + normalizedDesiredZ * rightZ;
  return rightAlignment >= 0 ? "right" : "left";
}
