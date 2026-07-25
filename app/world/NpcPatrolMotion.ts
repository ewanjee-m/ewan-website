import {
  RPG_LANDMARKS,
  isRpgWalkablePosition
} from "./RpgTownSceneLayout";

export type NpcPatrolWaypoint = readonly [x: number, z: number];
export type NpcPatrolAnimationKind =
  | "idle"
  | "walk"
  | "wave"
  | "talk"
  | "nod"
  | "look-around"
  | "pause";

export interface NpcPatrolRoute {
  npcId: string;
  variant: number;
  waypoints: readonly NpcPatrolWaypoint[];
  speed: number;
}

export interface NpcPatrolPose {
  x: number;
  z: number;
  yaw: number;
  stride: number;
  bob: number;
  rotation: number;
  phase: number;
  facing: -1 | 1;
  moving: boolean;
  animationKind: NpcPatrolAnimationKind;
}

const ROLE_DIRECTIONS: Readonly<Record<string, NpcPatrolWaypoint>> = {
  "npc-airport-traveler": [0, 1],
  "npc-tokyo-worker": [1, 0],
  "npc-gyukatsu-chef": [0, 1],
  "npc-sakura-visitor": [-1, 0],
  "npc-hanabi-child": [0, 1],
  "npc-hanabi-yukata": [0, 1],
  "npc-hanabi-vendor": [0, 1]
};

const FALLBACK_DIRECTIONS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2]
] as const satisfies readonly NpcPatrolWaypoint[];
const ROUTE_SAMPLE_SPACING = 0.15;
const MAX_LOCAL_ROUTE_RADIUS = 2;
export const NPC_ENDPOINT_ACTION_SECONDS = 1.2;
const FULL_TURN_RADIANS = Math.PI * 2;
const ACTION_KINDS = [
  "wave",
  "talk",
  "nod",
  "look-around",
  "pause"
] as const satisfies readonly NpcPatrolAnimationKind[];

function normalizeVariant(variant: number) {
  return Number.isFinite(variant) ? Math.max(0, Math.trunc(variant)) : 0;
}

export function isNpcPatrolRouteWalkable(
  waypoints: readonly NpcPatrolWaypoint[]
) {
  if (waypoints.length < 2 || waypoints.length > 4) {
    return false;
  }
  for (let index = 0; index < waypoints.length; index += 1) {
    const [x, z] = waypoints[index];
    if (!isRpgWalkablePosition(x, z)) {
      return false;
    }
    if (index === 0) {
      continue;
    }
    const [startX, startZ] = waypoints[index - 1];
    const segmentLength = Math.hypot(x - startX, z - startZ);
    if (segmentLength <= 1e-8) {
      return false;
    }
    const sampleCount = Math.ceil(segmentLength / ROUTE_SAMPLE_SPACING);
    for (let sample = 1; sample < sampleCount; sample += 1) {
      const progress = sample / sampleCount;
      if (
        !isRpgWalkablePosition(
          startX + (x - startX) * progress,
          startZ + (z - startZ) * progress
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

export function deriveNpcPatrolRoute(
  npcId: string,
  variant: number,
  authoredWaypoints?: readonly NpcPatrolWaypoint[]
): NpcPatrolRoute {
  const layout = RPG_LANDMARKS.find(
    (landmark) => landmark.kind === "npc" && landmark.id === npcId
  );
  if (!layout) {
    throw new RangeError(`Unknown RPG town NPC: ${npcId}`);
  }
  const safeVariant = normalizeVariant(variant);
  // A strolling pace, set against the visitor rather than in the abstract.
  // The crowd is what makes the visitor's own speed legible; at the old 0.55
  // everybody else was under a fifth of a walk and the town read as frozen.
  const speed = 1.05 + (safeVariant % 3) * 0.16;
  if (authoredWaypoints) {
    if (!isNpcPatrolRouteWalkable(authoredWaypoints)) {
      throw new RangeError(`NPC patrol route must stay walkable: ${npcId}`);
    }
    const [originX, , originZ] = layout.position;
    const startsAtOrigin =
      Math.hypot(
        authoredWaypoints[0][0] - originX,
        authoredWaypoints[0][1] - originZ
      ) <= 1e-8;
    const staysLocal = authoredWaypoints.every(
      ([x, z]) => Math.hypot(x - originX, z - originZ) <= MAX_LOCAL_ROUTE_RADIUS
    );
    if (!startsAtOrigin || !staysLocal) {
      throw new RangeError(`NPC patrol route must remain local: ${npcId}`);
    }
    return { npcId, variant: safeVariant, waypoints: authoredWaypoints, speed };
  }

  const waypointCount = 2 + (safeVariant % 3);
  const preferredDirection = ROLE_DIRECTIONS[npcId] ?? FALLBACK_DIRECTIONS[0];
  const directions = [
    preferredDirection,
    ...FALLBACK_DIRECTIONS.filter(
      ([x, z]) => x !== preferredDirection[0] || z !== preferredDirection[1]
    )
  ];

  for (const [directionX, directionZ] of directions) {
    const waypoints = Array.from({ length: waypointCount }, (_, index) => {
      const distance = index * 0.6;
      return [
        layout.position[0] + directionX * distance,
        layout.position[2] + directionZ * distance
      ] as const;
    });
    if (isNpcPatrolRouteWalkable(waypoints)) {
      return { npcId, variant: safeVariant, waypoints, speed };
    }
  }

  throw new RangeError(`No walkable local patrol route for NPC: ${npcId}`);
}

export function createNpcPatrolPose(): NpcPatrolPose {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    stride: 0,
    bob: 0,
    rotation: 0,
    phase: 0,
    facing: 1,
    moving: false,
    animationKind: "idle"
  };
}

function getRouteLength(waypoints: readonly NpcPatrolWaypoint[]) {
  let length = 0;
  for (let index = 1; index < waypoints.length; index += 1) {
    length += Math.hypot(
      waypoints[index][0] - waypoints[index - 1][0],
      waypoints[index][1] - waypoints[index - 1][1]
    );
  }
  return length;
}

function writeRoutePosition(
  route: NpcPatrolRoute,
  distance: number,
  forward: boolean,
  target: NpcPatrolPose
) {
  let remaining = Math.min(getRouteLength(route.waypoints), Math.max(0, distance));
  for (let index = 1; index < route.waypoints.length; index += 1) {
    const [startX, startZ] = route.waypoints[index - 1];
    const [endX, endZ] = route.waypoints[index];
    const deltaX = endX - startX;
    const deltaZ = endZ - startZ;
    const segmentLength = Math.hypot(deltaX, deltaZ);
    if (remaining <= segmentLength || index === route.waypoints.length - 1) {
      const progress = segmentLength > 0 ? remaining / segmentLength : 0;
      target.x = startX + deltaX * progress;
      target.z = startZ + deltaZ * progress;
      const facingX = forward ? deltaX : -deltaX;
      const facingZ = forward ? deltaZ : -deltaZ;
      target.yaw = Math.atan2(facingX, facingZ);
      target.facing = facingX < -1e-8 ? -1 : 1;
      return;
    }
    remaining -= segmentLength;
  }
}

export function evaluateNpcPatrolMotionInto(
  route: NpcPatrolRoute,
  elapsedSeconds: number,
  reducedMotion: boolean,
  target: NpcPatrolPose
) {
  const routeLength = getRouteLength(route.waypoints);
  const travelSeconds = routeLength / route.speed;
  const cycleSeconds = (NPC_ENDPOINT_ACTION_SECONDS + travelSeconds) * 2;
  const safeElapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  if (reducedMotion) {
    writeRoutePosition(route, 0, true, target);
    target.stride = 0;
    target.bob = 0;
    target.rotation = 0;
    target.phase = 0;
    target.moving = false;
    target.animationKind = "idle";
    return target;
  }
  const cycleTime = safeElapsed % cycleSeconds;
  let distance = 0;
  let forward = true;
  let moving = false;
  let phase = 0;

  if (cycleTime < NPC_ENDPOINT_ACTION_SECONDS) {
    phase = cycleTime / NPC_ENDPOINT_ACTION_SECONDS;
  } else if (cycleTime < NPC_ENDPOINT_ACTION_SECONDS + travelSeconds) {
    const travelTime = cycleTime - NPC_ENDPOINT_ACTION_SECONDS;
    distance = travelTime * route.speed;
    moving = true;
    phase = travelTime / travelSeconds;
  } else if (cycleTime < NPC_ENDPOINT_ACTION_SECONDS * 2 + travelSeconds) {
    distance = routeLength;
    phase =
      (cycleTime - NPC_ENDPOINT_ACTION_SECONDS - travelSeconds) /
      NPC_ENDPOINT_ACTION_SECONDS;
  } else {
    const travelTime =
      cycleTime - NPC_ENDPOINT_ACTION_SECONDS * 2 - travelSeconds;
    distance = routeLength - travelTime * route.speed;
    forward = false;
    moving = true;
    phase = travelTime / travelSeconds;
  }

  writeRoutePosition(route, distance, forward, target);
  target.moving = moving;
  target.phase = Math.min(1, Math.max(0, phase));
  target.stride = target.moving
    ? ((safeElapsed * route.speed * 8) % FULL_TURN_RADIANS +
        FULL_TURN_RADIANS) %
      FULL_TURN_RADIANS
    : 0;
  target.bob = target.moving ? Math.sin(target.stride) * 0.035 : 0;
  target.rotation = 0;
  target.animationKind = target.moving
    ? "walk"
    : ACTION_KINDS[route.variant % ACTION_KINDS.length];
  if (!target.moving) {
    const gesture = Math.sin(target.phase * Math.PI);
    switch (target.animationKind) {
      case "wave":
        target.bob = gesture * 0.006;
        target.rotation = gesture * 0.065;
        break;
      case "talk":
        target.bob = gesture * 0.012;
        target.rotation = -gesture * 0.018;
        break;
      case "nod":
        target.bob = -gesture * 0.025;
        target.rotation = gesture * 0.025;
        break;
      case "look-around":
        target.yaw += Math.sin(target.phase * FULL_TURN_RADIANS) * 0.22;
        target.rotation = gesture * 0.035;
        break;
      default:
        break;
    }
  }
  return target;
}
