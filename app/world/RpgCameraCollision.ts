import {
  RPG_CAMERA_COLUMN_OBSTACLES,
  type RpgCameraColumnObstacle
} from "./RpgCameraObstacleSources";
import { RPG_LANDMARKS } from "./RpgTownSceneLayout";

type RpgCameraPoint = readonly [number, number, number];
type MutableRpgCameraPoint = [number, number, number];

export interface RpgCameraDynamicObstacle {
  position: RpgCameraPoint;
  size: readonly [length: number, height: number, width: number];
  /** Heading yaw in radians: 0 faces +Z and PI / 2 faces +X. */
  yaw: number;
  clearance?: number;
  cameraCollision?: "solid" | "occlusion-only";
}

export interface RpgCameraCollisionInput {
  player: RpgCameraPoint;
  desiredCamera: RpgCameraPoint;
  clearance?: number;
  dynamicObstacles?: readonly Readonly<RpgCameraDynamicObstacle>[];
  columnObstacles?: readonly Readonly<RpgCameraColumnObstacle>[];
}

export interface RpgCameraCollisionSafeCandidateInput {
  player: RpgCameraPoint;
  candidateCamera: RpgCameraPoint;
  fallbackCamera: RpgCameraPoint;
  clearance?: number;
  dynamicObstacles?: readonly Readonly<RpgCameraDynamicObstacle>[];
  columnObstacles?: readonly Readonly<RpgCameraColumnObstacle>[];
}

const DEFAULT_CLEARANCE = 0.55;
// A pole or trunk is thinner than the padding a wall needs, so the building
// clearance would retract the boom for a prop the camera would never touch.
export const RPG_COLUMN_CAMERA_CLEARANCE = 0.25;
export const RPG_NPC_CAMERA_CLEARANCE = 0.25;
/**
 * No obstacle may pull the boom closer than this. Retracting further cannot
 * recover the shot anyway — it only puts the lens inside the character — so
 * every resolved camera position is pushed back out to this distance.
 */
export const RPG_CAMERA_MINIMUM_BOOM_DISTANCE = 2.6;
export const RPG_CAMERA_MINIMUM_BOOM_NUMERICAL_MARGIN = 1e-9;
const COLLISION_RATIO_EPSILON = 1e-4;
export const RPG_CAMERA_MINIMUM_FULL_BODY_FRAMING_DISTANCE = 4.5;
const LATERAL_ESCAPE_ANGLES = [
  30,
  -30,
  45,
  -45,
  60,
  -60,
  75,
  -75,
  90,
  -90,
  105,
  -105,
  120,
  -120,
  135,
  -135,
  150,
  -150,
  165,
  -165,
  180
] as const;

function isFinitePoint(point: RpgCameraPoint) {
  return point.every(Number.isFinite);
}

function segmentAxisInterval(
  start: number,
  delta: number,
  minimum: number,
  maximum: number
): readonly [number, number] | null {
  if (Math.abs(delta) < 1e-8) {
    return start >= minimum && start <= maximum
      ? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      : null;
  }
  const first = (minimum - start) / delta;
  const second = (maximum - start) / delta;
  return first <= second ? [first, second] : [second, first];
}

interface UprightBoxProbe {
  player: RpgCameraPoint;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  centerX: number;
  centerZ: number;
  halfX: number;
  halfZ: number;
  top: number;
  clearance: number;
  nearestRatio: number;
}

/**
 * Reused so the per-frame landmark and column sweeps stay allocation-free.
 * `uprightBoxEntryRatio` reads it immediately and never retains it.
 */
const uprightBoxProbe: UprightBoxProbe = {
  player: [0, 0, 0],
  deltaX: 0,
  deltaY: 0,
  deltaZ: 0,
  centerX: 0,
  centerZ: 0,
  halfX: 0,
  halfZ: 0,
  top: 0,
  clearance: 0,
  nearestRatio: 1
};

/**
 * Entry ratio of the boom into one upright, axis-aligned footprint, or null
 * when the boom stays clear of it. A thin column only differs from a building
 * in its half extents, so both go through this probe.
 */
function uprightBoxEntryRatio({
  player,
  deltaX,
  deltaY,
  deltaZ,
  centerX,
  centerZ,
  halfX,
  halfZ,
  top,
  clearance,
  nearestRatio
}: UprightBoxProbe): number | null {
  const xInterval = segmentAxisInterval(
    player[0],
    deltaX,
    centerX - halfX - clearance,
    centerX + halfX + clearance
  );
  const zInterval = segmentAxisInterval(
    player[2],
    deltaZ,
    centerZ - halfZ - clearance,
    centerZ + halfZ + clearance
  );
  if (!xInterval || !zInterval) {
    return null;
  }

  let entryRatio = Math.max(0, xInterval[0], zInterval[0]);
  const exitRatio = Math.min(1, xInterval[1], zInterval[1]);
  if (entryRatio > exitRatio || entryRatio >= nearestRatio) {
    return null;
  }

  const startsInsideExpandedFootprint =
    player[0] >= centerX - halfX - clearance &&
    player[0] <= centerX + halfX + clearance &&
    player[2] >= centerZ - halfZ - clearance &&
    player[2] <= centerZ + halfZ + clearance;
  if (startsInsideExpandedFootprint) {
    const actualXInterval = segmentAxisInterval(
      player[0],
      deltaX,
      centerX - halfX,
      centerX + halfX
    );
    const actualZInterval = segmentAxisInterval(
      player[2],
      deltaZ,
      centerZ - halfZ,
      centerZ + halfZ
    );
    if (!actualXInterval || !actualZInterval) {
      return null;
    }
    const actualEntryRatio = Math.max(
      0,
      actualXInterval[0],
      actualZInterval[0]
    );
    const actualExitRatio = Math.min(
      1,
      actualXInterval[1],
      actualZInterval[1]
    );
    if (actualEntryRatio > actualExitRatio) {
      return null;
    }
    const boomLength = Math.hypot(deltaX, deltaY, deltaZ);
    const clearanceRatio = boomLength > 1e-8 ? clearance / boomLength : 0;
    entryRatio = Math.max(0, actualEntryRatio - clearanceRatio);
  }

  const cameraHeightAtEntry = player[1] + deltaY * entryRatio;
  if (cameraHeightAtEntry > top + clearance * 0.35) {
    return null;
  }
  return entryRatio;
}

export function calculateRpgCameraCollisionRatio({
  player,
  desiredCamera,
  clearance = DEFAULT_CLEARANCE,
  dynamicObstacles = [],
  columnObstacles = RPG_CAMERA_COLUMN_OBSTACLES
}: RpgCameraCollisionInput) {
  if (!isFinitePoint(player) || !isFinitePoint(desiredCamera)) {
    return 1;
  }

  const safeClearance = Number.isFinite(clearance)
    ? Math.max(0, clearance)
    : DEFAULT_CLEARANCE;
  const deltaX = desiredCamera[0] - player[0];
  const deltaY = desiredCamera[1] - player[1];
  const deltaZ = desiredCamera[2] - player[2];
  let nearestRatio = 1;

  for (const landmark of RPG_LANDMARKS) {
    if (!landmark.blocksMovement) {
      continue;
    }

    uprightBoxProbe.player = player;
    uprightBoxProbe.deltaX = deltaX;
    uprightBoxProbe.deltaY = deltaY;
    uprightBoxProbe.deltaZ = deltaZ;
    uprightBoxProbe.centerX = landmark.position[0];
    uprightBoxProbe.centerZ = landmark.position[2];
    uprightBoxProbe.halfX = landmark.size[0] / 2;
    uprightBoxProbe.halfZ = landmark.size[2] / 2;
    uprightBoxProbe.top = landmark.position[1] + landmark.size[1] / 2;
    uprightBoxProbe.clearance = safeClearance;
    uprightBoxProbe.nearestRatio = nearestRatio;
    const entryRatio = uprightBoxEntryRatio(uprightBoxProbe);
    if (entryRatio === null) {
      continue;
    }
    nearestRatio = Math.max(0, entryRatio - COLLISION_RATIO_EPSILON);
  }

  const boomLength = Math.hypot(deltaX, deltaY, deltaZ);

  const columnClearance = Math.min(
    safeClearance,
    RPG_COLUMN_CAMERA_CLEARANCE
  );

  for (const column of columnObstacles) {
    const reach = boomLength + column.radius + columnClearance;
    if (
      Math.abs(column.x - player[0]) > reach ||
      Math.abs(column.z - player[2]) > reach
    ) {
      continue;
    }

    uprightBoxProbe.player = player;
    uprightBoxProbe.deltaX = deltaX;
    uprightBoxProbe.deltaY = deltaY;
    uprightBoxProbe.deltaZ = deltaZ;
    uprightBoxProbe.centerX = column.x;
    uprightBoxProbe.centerZ = column.z;
    uprightBoxProbe.halfX = column.radius;
    uprightBoxProbe.halfZ = column.radius;
    uprightBoxProbe.top = column.height;
    uprightBoxProbe.clearance = columnClearance;
    uprightBoxProbe.nearestRatio = nearestRatio;
    const entryRatio = uprightBoxEntryRatio(uprightBoxProbe);
    if (entryRatio === null) {
      continue;
    }
    nearestRatio = Math.max(0, entryRatio - COLLISION_RATIO_EPSILON);
  }

  for (const obstacle of dynamicObstacles) {
    if (
      !isFinitePoint(obstacle.position) ||
      !obstacle.size.every(Number.isFinite) ||
      obstacle.size.some((value) => value <= 0) ||
      !Number.isFinite(obstacle.yaw)
    ) {
      continue;
    }

    const obstacleClearance = Number.isFinite(obstacle.clearance)
      ? Math.max(0, obstacle.clearance as number)
      : safeClearance;
    const headingX = Math.sin(obstacle.yaw);
    const headingZ = Math.cos(obstacle.yaw);
    const sideX = headingZ;
    const sideZ = -headingX;
    const playerDeltaX = player[0] - obstacle.position[0];
    const playerDeltaZ = player[2] - obstacle.position[2];
    const playerAlong =
      playerDeltaX * headingX + playerDeltaZ * headingZ;
    const playerAcross = playerDeltaX * sideX + playerDeltaZ * sideZ;
    const segmentAlong = deltaX * headingX + deltaZ * headingZ;
    const segmentAcross = deltaX * sideX + deltaZ * sideZ;
    const halfLength = obstacle.size[0] / 2;
    const halfWidth = obstacle.size[2] / 2;
    const alongInterval = segmentAxisInterval(
      playerAlong,
      segmentAlong,
      -halfLength - obstacleClearance,
      halfLength + obstacleClearance
    );
    const acrossInterval = segmentAxisInterval(
      playerAcross,
      segmentAcross,
      -halfWidth - obstacleClearance,
      halfWidth + obstacleClearance
    );
    if (!alongInterval || !acrossInterval) {
      continue;
    }

    let entryRatio = Math.max(0, alongInterval[0], acrossInterval[0]);
    let exitRatio = Math.min(1, alongInterval[1], acrossInterval[1]);
    if (entryRatio > exitRatio || entryRatio >= nearestRatio) {
      continue;
    }

    const startsInsideExpandedFootprint =
      Math.abs(playerAlong) <= halfLength + obstacleClearance &&
      Math.abs(playerAcross) <= halfWidth + obstacleClearance;
    if (startsInsideExpandedFootprint) {
      const actualAlongInterval = segmentAxisInterval(
        playerAlong,
        segmentAlong,
        -halfLength,
        halfLength
      );
      const actualAcrossInterval = segmentAxisInterval(
        playerAcross,
        segmentAcross,
        -halfWidth,
        halfWidth
      );
      if (!actualAlongInterval || !actualAcrossInterval) {
        continue;
      }
      const actualEntryRatio = Math.max(
        0,
        actualAlongInterval[0],
        actualAcrossInterval[0]
      );
      const actualExitRatio = Math.min(
        1,
        actualAlongInterval[1],
        actualAcrossInterval[1]
      );
      if (actualEntryRatio > actualExitRatio) {
        continue;
      }
      const clearanceRatio =
        boomLength > 1e-8 ? obstacleClearance / boomLength : 0;
      entryRatio = Math.max(0, actualEntryRatio - clearanceRatio);
      exitRatio = actualExitRatio;
    }

    const cameraHeightAtEntry = player[1] + deltaY * entryRatio;
    const obstacleTop =
      obstacle.position[1] + obstacle.size[1] / 2 + obstacleClearance * 0.35;
    if (cameraHeightAtEntry > obstacleTop) {
      continue;
    }
    nearestRatio = Math.max(0, entryRatio - COLLISION_RATIO_EPSILON);
  }

  return nearestRatio;
}

export function selectRpgCameraCollisionSafeCandidateInto(
  {
    player,
    candidateCamera,
    fallbackCamera,
    clearance,
    dynamicObstacles,
    columnObstacles
  }: RpgCameraCollisionSafeCandidateInput,
  target: MutableRpgCameraPoint
) {
  const candidateIsClear =
    calculateRpgCameraCollisionRatio({
      player,
      desiredCamera: candidateCamera,
      clearance,
      dynamicObstacles,
      columnObstacles
    }) === 1;
  const source = candidateIsClear ? candidateCamera : fallbackCamera;
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
  return !candidateIsClear;
}

/**
 * Pushes a resolved camera back out along its own boom until it reaches the
 * minimum distance, never past the boom the placement asked for.
 */
function extendToMinimumBoomInto(
  player: RpgCameraPoint,
  desiredCamera: RpgCameraPoint,
  target: MutableRpgCameraPoint
) {
  const desiredX = desiredCamera[0] - player[0];
  const desiredY = desiredCamera[1] - player[1];
  const desiredZ = desiredCamera[2] - player[2];
  const desiredLength = Math.hypot(desiredX, desiredY, desiredZ);
  const minimum = Math.min(
    RPG_CAMERA_MINIMUM_BOOM_DISTANCE +
      RPG_CAMERA_MINIMUM_BOOM_NUMERICAL_MARGIN,
    desiredLength
  );
  const currentX = target[0] - player[0];
  const currentY = target[1] - player[1];
  const currentZ = target[2] - player[2];
  const currentLength = Math.hypot(currentX, currentY, currentZ);
  if (currentLength >= minimum) {
    return;
  }

  // A fully collapsed boom keeps no direction of its own, so it falls back to
  // the direction the placement asked for.
  const useCurrent = currentLength > 1e-6;
  const directionX = useCurrent ? currentX : desiredX;
  const directionY = useCurrent ? currentY : desiredY;
  const directionZ = useCurrent ? currentZ : desiredZ;
  const directionLength = useCurrent ? currentLength : desiredLength;
  if (directionLength < 1e-6) {
    return;
  }
  const scale = minimum / directionLength;
  target[0] = player[0] + directionX * scale;
  target[1] = player[1] + directionY * scale;
  target[2] = player[2] + directionZ * scale;
}

export function resolveRpgCameraCollisionInto(
  input: RpgCameraCollisionInput,
  target: MutableRpgCameraPoint
) {
  const ratio = calculateRpgCameraCollisionRatio(input);
  for (let axis = 0; axis < 3; axis += 1) {
    target[axis] =
      input.player[axis] +
      (input.desiredCamera[axis] - input.player[axis]) * ratio;
  }
  extendToMinimumBoomInto(input.player, input.desiredCamera, target);
  return ratio;
}

export function resolveRpgCameraOrbitCollisionInto(
  input: RpgCameraCollisionInput,
  target: MutableRpgCameraPoint
) {
  const desiredBoomLength = Math.hypot(
    input.desiredCamera[0] - input.player[0],
    input.desiredCamera[1] - input.player[1],
    input.desiredCamera[2] - input.player[2]
  );
  const requiredRatio =
    desiredBoomLength > 1e-8
      ? Math.min(
          1,
          RPG_CAMERA_MINIMUM_FULL_BODY_FRAMING_DISTANCE /
            desiredBoomLength
        )
      : 1;
  const directRatio = resolveRpgCameraCollisionInto(input, target);
  if (directRatio >= requiredRatio) {
    return false;
  }
  // `target` already carries the minimum boom; every early exit below leaves it
  // in place, and the escape branch re-applies it to its own candidate.
  if (
    input.dynamicObstacles?.length &&
    calculateRpgCameraCollisionRatio({
      ...input,
      dynamicObstacles: []
    }) >= requiredRatio
  ) {
    // A vehicle or a townsperson may briefly cross the boom. Shortening the
    // boom keeps the player's screen direction stable; a lateral orbit would
    // swing the controls even though the static environment is clear.
    return false;
  }

  const offsetX = input.desiredCamera[0] - input.player[0];
  const offsetY = input.desiredCamera[1] - input.player[1];
  const offsetZ = input.desiredCamera[2] - input.player[2];
  if (Math.hypot(offsetX, offsetZ) < 1e-8) {
    return false;
  }

  let bestRatio = directRatio;
  let bestX = target[0];
  let bestY = target[1];
  let bestZ = target[2];
  const candidate: MutableRpgCameraPoint = [0, 0, 0];

  for (const angle of LATERAL_ESCAPE_ANGLES) {
    const radians = (angle * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    candidate[0] = input.player[0] + offsetX * cosine - offsetZ * sine;
    candidate[1] = input.player[1] + offsetY;
    candidate[2] = input.player[2] + offsetX * sine + offsetZ * cosine;
    const candidateRatio = calculateRpgCameraCollisionRatio({
      ...input,
      desiredCamera: candidate
    });
    if (candidateRatio <= bestRatio) {
      continue;
    }
    bestRatio = candidateRatio;
    bestX = input.player[0] + (candidate[0] - input.player[0]) * bestRatio;
    bestY = input.player[1] + (candidate[1] - input.player[1]) * bestRatio;
    bestZ = input.player[2] + (candidate[2] - input.player[2]) * bestRatio;
    if (candidateRatio >= 1) {
      break;
    }
  }

  if (bestRatio < requiredRatio) {
    return false;
  }
  target[0] = bestX;
  target[1] = bestY;
  target[2] = bestZ;
  extendToMinimumBoomInto(input.player, input.desiredCamera, target);
  return true;
}
