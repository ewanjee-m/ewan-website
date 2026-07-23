export interface RpgBusMotionInput {
  routeProgress: number;
  completedLoops: number;
}

export interface RpgBusMotionPose {
  position: [number, number, number];
  yaw: number;
  wheelRotation: number;
}

export interface RpgBusRouteSample extends RpgBusMotionPose {
  routeProgress: number;
}

export type RpgBusSize = readonly [length: number, height: number, width: number];

const ROUTE_CENTER_X = -31;
const ROUTE_SOUTH_Z = -4;
const ROUTE_NORTH_Z = 18;
const ROUTE_TURN_RADIUS = 2;
const ROUTE_STRAIGHT_LENGTH = ROUTE_NORTH_Z - ROUTE_SOUTH_Z;
const ROUTE_HALF_TURN_LENGTH = Math.PI * ROUTE_TURN_RADIUS;

export const RPG_BUS_ROUTE_LENGTH =
  ROUTE_STRAIGHT_LENGTH * 2 + ROUTE_HALF_TURN_LENGTH * 2;
export const RPG_BUS_WHEEL_RADIUS = 0.32;
export const RPG_BUS_ACTOR_CLEARANCE = 0.3;
export const RPG_BUS_DEFAULT_SIZE: RpgBusSize = [6, 2.15, 2.2];
export const RPG_BUS_ROUTE_BOUNDS = {
  minimumX: ROUTE_CENTER_X - ROUTE_TURN_RADIUS,
  maximumX: ROUTE_CENTER_X + ROUTE_TURN_RADIUS,
  minimumZ: ROUTE_SOUTH_Z - ROUTE_TURN_RADIUS,
  maximumZ: ROUTE_NORTH_Z + ROUTE_TURN_RADIUS
} as const;

export function getRpgBusAdvanceSeconds(
  deltaSeconds: number,
  reducedMotion: boolean
): number {
  if (reducedMotion || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return 0;
  }
  return deltaSeconds;
}

export function createRpgBusMotionPose(): RpgBusMotionPose {
  return {
    position: [-33, 1.075, -4],
    yaw: 0,
    wheelRotation: 0
  };
}

export function evaluateRpgBusMotionInto(
  input: Readonly<RpgBusMotionInput>,
  target: RpgBusMotionPose
): RpgBusMotionPose {
  const routeProgress = Number.isFinite(input.routeProgress)
    ? Math.min(1, Math.max(0, input.routeProgress))
    : 0;
  const routeDistance = routeProgress * RPG_BUS_ROUTE_LENGTH;
  let x = ROUTE_CENTER_X - ROUTE_TURN_RADIUS;
  let z = ROUTE_SOUTH_Z;
  let localYaw = 0;

  if (routeDistance <= ROUTE_STRAIGHT_LENGTH) {
    z = ROUTE_SOUTH_Z + routeDistance;
  } else if (
    routeDistance <= ROUTE_STRAIGHT_LENGTH + ROUTE_HALF_TURN_LENGTH
  ) {
    const turnRadians =
      (routeDistance - ROUTE_STRAIGHT_LENGTH) / ROUTE_TURN_RADIUS;
    const routeAngle = Math.PI - turnRadians;
    x = ROUTE_CENTER_X + Math.cos(routeAngle) * ROUTE_TURN_RADIUS;
    z = ROUTE_NORTH_Z + Math.sin(routeAngle) * ROUTE_TURN_RADIUS;
    localYaw = turnRadians;
  } else if (
    routeDistance <= ROUTE_STRAIGHT_LENGTH * 2 + ROUTE_HALF_TURN_LENGTH
  ) {
    x = ROUTE_CENTER_X + ROUTE_TURN_RADIUS;
    z =
      ROUTE_NORTH_Z -
      (routeDistance - ROUTE_STRAIGHT_LENGTH - ROUTE_HALF_TURN_LENGTH);
    localYaw = Math.PI;
  } else {
    const turnRadians =
      (routeDistance -
        ROUTE_STRAIGHT_LENGTH * 2 -
        ROUTE_HALF_TURN_LENGTH) /
      ROUTE_TURN_RADIUS;
    const routeAngle = -turnRadians;
    x = ROUTE_CENTER_X + Math.cos(routeAngle) * ROUTE_TURN_RADIUS;
    z = ROUTE_SOUTH_Z + Math.sin(routeAngle) * ROUTE_TURN_RADIUS;
    localYaw = Math.PI + turnRadians;
  }

  const completedLoops = Number.isFinite(input.completedLoops)
    ? Math.max(0, Math.floor(input.completedLoops))
    : 0;
  const unwrappedDistance =
    (completedLoops + routeProgress) * RPG_BUS_ROUTE_LENGTH;
  target.position[0] = x;
  target.position[1] = 1.075;
  target.position[2] = z;
  target.yaw = localYaw + completedLoops * Math.PI * 2;
  target.wheelRotation =
    unwrappedDistance === 0
      ? 0
      : -unwrappedDistance / RPG_BUS_WHEEL_RADIUS;
  return target;
}

export function isRpgPositionOutsideMovingBus(
  x: number,
  z: number,
  pose: Readonly<RpgBusMotionPose>,
  size: RpgBusSize = RPG_BUS_DEFAULT_SIZE,
  clearance = RPG_BUS_ACTOR_CLEARANCE
): boolean {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    !pose.position.every(Number.isFinite) ||
    !Number.isFinite(pose.yaw)
  ) {
    return false;
  }
  const safeClearance = Number.isFinite(clearance)
    ? Math.max(0, clearance)
    : RPG_BUS_ACTOR_CLEARANCE;
  const deltaX = x - pose.position[0];
  const deltaZ = z - pose.position[2];
  const headingX = Math.sin(pose.yaw);
  const headingZ = Math.cos(pose.yaw);
  const sideX = headingZ;
  const sideZ = -headingX;
  const along = Math.abs(deltaX * headingX + deltaZ * headingZ);
  const across = Math.abs(deltaX * sideX + deltaZ * sideZ);

  return (
    along > Math.max(0, size[0]) / 2 + safeClearance ||
    across > Math.max(0, size[2]) / 2 + safeClearance
  );
}

export function sampleRpgBusRoute(sampleCount = 256): RpgBusRouteSample[] {
  const safeSampleCount = Number.isFinite(sampleCount)
    ? Math.max(4, Math.floor(sampleCount))
    : 256;
  return Array.from({ length: safeSampleCount }, (_, index) => {
    const routeProgress = index / safeSampleCount;
    const pose = evaluateRpgBusMotionInto(
      { routeProgress, completedLoops: 0 },
      createRpgBusMotionPose()
    );
    return { routeProgress, ...pose };
  });
}
