import {
  projectWorldToReference,
  projectWorldVectorToReferenceInTriangle
} from "./RpgWorldGeometry";
import {
  RPG_WORLD_ORIENTATION,
  type WorldPoint2,
  type WorldPoint3
} from "./RpgWorldModel";

export type RpgWorldPoint = [number, number, number];

export interface RpgScreenDirection {
  x: number;
  y: number;
}

export const RPG_WORLD_ROTATION_RADIANS = RPG_WORLD_ORIENTATION.rotationRadians;
const ROTATION_SINE = Math.sin(RPG_WORLD_ROTATION_RADIANS);
const ROTATION_COSINE = Math.cos(RPG_WORLD_ROTATION_RADIANS);
const DIRECTION_EPSILON = 1e-12;

export function createRpgWorldPoint(): RpgWorldPoint {
  return [0, 0, 0];
}

export function createRpgScreenDirection(): RpgScreenDirection {
  return { x: 0, y: 0 };
}

function clearScreenDirection(target: RpgScreenDirection) {
  target.x = 0;
  target.y = 0;
}

function clearWorldDirection(target: RpgWorldPoint) {
  target[0] = 0;
  target[1] = 0;
  target[2] = 0;
}

function worldX(position: WorldPoint2 | WorldPoint3) {
  return position[0];
}

function worldZ(position: WorldPoint2 | WorldPoint3) {
  return position.length === 3 ? position[2] : position[1];
}

function hasFiniteCoordinates(position: WorldPoint2 | WorldPoint3) {
  return position.every(Number.isFinite);
}

/**
 * Normalizes a reference-image segment into screen coordinates. Reference and
 * screen coordinates both use +x right and +y down, so a shared crop
 * translation cancels out of the direction.
 */
export function normalizeRpgReferenceDirectionInto(
  current: readonly [number, number],
  next: readonly [number, number],
  target: RpgScreenDirection
): RpgScreenDirection | null {
  if (![...current, ...next].every(Number.isFinite)) {
    clearScreenDirection(target);
    return null;
  }
  const deltaX = next[0] - current[0];
  const deltaY = next[1] - current[1];
  const length = Math.hypot(deltaX, deltaY);
  if (length <= DIRECTION_EPSILON) {
    clearScreenDirection(target);
    return target;
  }
  target.x = deltaX / length;
  target.y = deltaY / length;
  return target;
}

/**
 * Projects a logical world heading through the measured reference image. The
 * local projected delta, rather than a fixed isometric angle or camera yaw,
 * is the screen-direction authority.
 */
export function projectRpgWorldDirectionToScreenInto(
  current: WorldPoint2 | WorldPoint3,
  direction: WorldPoint2 | WorldPoint3,
  target: RpgScreenDirection
): RpgScreenDirection | null {
  if (!hasFiniteCoordinates(current) || !hasFiniteCoordinates(direction)) {
    clearScreenDirection(target);
    return null;
  }
  const directionX = worldX(direction);
  const directionZ = worldZ(direction);
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength <= DIRECTION_EPSILON) {
    clearScreenDirection(target);
    return target;
  }
  const currentProjection = projectWorldToReference(current);
  if (!currentProjection) {
    clearScreenDirection(target);
    return null;
  }
  const referenceVector = projectWorldVectorToReferenceInTriangle(
    currentProjection.triangleId,
    [
      directionX / directionLength,
      directionZ / directionLength
    ]
  );
  if (!referenceVector) {
    clearScreenDirection(target);
    return null;
  }
  return normalizeRpgReferenceDirectionInto(
    [0, 0],
    referenceVector,
    target
  );
}

/**
 * Resolves a canonical screen direction back into a local logical-world
 * heading with the public non-affine reference inverse. Screen +y is down.
 */
export function unprojectRpgScreenDirectionToWorldInto(
  current: WorldPoint2 | WorldPoint3,
  screen: Readonly<RpgScreenDirection>,
  target: RpgWorldPoint
): RpgWorldPoint | null {
  if (
    !hasFiniteCoordinates(current) ||
    !Number.isFinite(screen.x) ||
    !Number.isFinite(screen.y)
  ) {
    clearWorldDirection(target);
    return null;
  }
  const screenLength = Math.hypot(screen.x, screen.y);
  if (screenLength <= DIRECTION_EPSILON) {
    clearWorldDirection(target);
    return target;
  }
  const projection = projectWorldToReference(current);
  if (!projection) {
    clearWorldDirection(target);
    return null;
  }
  const projectedWorldX = projectWorldVectorToReferenceInTriangle(
    projection.triangleId,
    [1, 0]
  );
  const projectedWorldZ = projectWorldVectorToReferenceInTriangle(
    projection.triangleId,
    [0, 1]
  );
  if (!projectedWorldX || !projectedWorldZ) {
    clearWorldDirection(target);
    return null;
  }
  const requestedX = screen.x / screenLength;
  const requestedY = screen.y / screenLength;
  const dReferenceXByWorldX = projectedWorldX[0];
  const dReferenceYByWorldX = projectedWorldX[1];
  const dReferenceXByWorldZ = projectedWorldZ[0];
  const dReferenceYByWorldZ = projectedWorldZ[1];
  const determinant =
    dReferenceXByWorldX * dReferenceYByWorldZ -
    dReferenceXByWorldZ * dReferenceYByWorldX;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= DIRECTION_EPSILON) {
    clearWorldDirection(target);
    return null;
  }
  const worldDirectionX =
    (requestedX * dReferenceYByWorldZ -
      requestedY * dReferenceXByWorldZ) /
    determinant;
  const worldDirectionZ =
    (dReferenceXByWorldX * requestedY -
      dReferenceYByWorldX * requestedX) /
    determinant;
  const worldLength = Math.hypot(worldDirectionX, worldDirectionZ);
  if (!Number.isFinite(worldLength) || worldLength <= DIRECTION_EPSILON) {
    clearWorldDirection(target);
    return null;
  }
  target[0] = worldDirectionX / worldLength;
  target[1] = 0;
  target[2] = worldDirectionZ / worldLength;
  return target;
}

export function rotateRpgWorldPointInto(
  source: readonly [number, number, number],
  target: RpgWorldPoint
): RpgWorldPoint {
  target[0] = source[0] * ROTATION_COSINE + source[2] * ROTATION_SINE;
  target[1] = source[1];
  target[2] = -source[0] * ROTATION_SINE + source[2] * ROTATION_COSINE;
  return target;
}

export function unrotateRpgWorldPointInto(
  source: readonly [number, number, number],
  target: RpgWorldPoint
): RpgWorldPoint {
  target[0] = source[0] * ROTATION_COSINE - source[2] * ROTATION_SINE;
  target[1] = source[1];
  target[2] = source[0] * ROTATION_SINE + source[2] * ROTATION_COSINE;
  return target;
}
