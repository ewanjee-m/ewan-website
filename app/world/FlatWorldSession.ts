import type { DestinationId } from "../guide/GuideContract";
import type { MovementIntent, WorldSnapshot } from "./WorldSession";
import {
  getArrival,
  getNavigationRegionAt,
  type NavigationRegion
} from "./RpgWorldGeometry";
import {
  RPG_WORLD_SPAWN,
  RPG_WORLD_ZONE_IDS,
  RPG_WORLD_ZONES
} from "./RpgWorldModel";

export interface FlatWorldBounds {
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}

export interface FlatWorldSessionOptions {
  bounds: FlatWorldBounds;
  start: {
    x: number;
    z: number;
  };
  moveSpeed: number;
  canMoveTo?: (x: number, z: number) => boolean;
  resolveFastTravelDestination?: (
    destinationId: DestinationId
  ) => FlatWorldFastTravelDestination | null;
}

export interface FlatWorldFastTravelDestination {
  readonly position: readonly [number, number, number];
  readonly heading: readonly [number, number];
}

export interface FlatWorldLogicalCameraSnapshot {
  readonly anchor: readonly [number, number, number];
  readonly player: readonly [number, number, number];
  readonly heading: readonly [number, number, number];
}

export interface FlatWorldNavigationSnapshot {
  readonly revision: number;
  readonly position: readonly [number, number, number];
  readonly surfaceNormal: readonly [number, number, number];
  readonly heading: readonly [number, number, number];
  readonly moving: boolean;
  readonly grounded: boolean;
  readonly logicalCamera: FlatWorldLogicalCameraSnapshot;
  readonly navigationRegion: NavigationRegion;
  readonly navigationRegionId: string;
  readonly transitionProgress: number | null;
  readonly currentZoneId: DestinationId;
  readonly highlightedZoneIds: readonly DestinationId[];
  readonly destinationId: DestinationId;
}

export interface FlatWorldSession {
  setMovement(intent: MovementIntent): void;
  jump(): void;
  reset(): void;
  teleport(
    targetX: number,
    targetZ: number,
    heading?: { x: number; z: number }
  ): boolean;
  fastTravel(destinationId: DestinationId): FlatWorldNavigationSnapshot;
  advance(deltaSeconds: number): void;
  readSnapshot(target: WorldSnapshot): WorldSnapshot;
  getSnapshot(): WorldSnapshot;
  getNavigationSnapshot(): FlatWorldNavigationSnapshot;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const MAX_COLLISION_STEP = 0.25;
const MAX_PLAYER_FRAME_SECONDS = 0.25;
const TELEPORT_SEARCH_STEP = 0.5;
const TELEPORT_SEARCH_MAX_RADIUS = 3;
const TELEPORT_SEARCH_DIRECTIONS = 8;

const UP_VECTOR = Object.freeze([0, 1, 0] as const);

function freezeVector3(
  x: number,
  y: number,
  z: number
): readonly [number, number, number] {
  return Object.freeze([x, y, z] as const);
}

function freezeNavigationRegion(region: NavigationRegion): NavigationRegion {
  const highlightedZoneIds = Object.freeze([
    ...region.highlightedZoneIds
  ]) as readonly DestinationId[];
  return Object.freeze({
    ...region,
    highlightedZoneIds
  }) as NavigationRegion;
}

function getFallbackNavigationRegion() {
  return getNavigationRegionAt(RPG_WORLD_SPAWN)!;
}

function createNavigationSnapshot({
  revision,
  position,
  heading,
  moving,
  grounded
}: {
  revision: number;
  position: readonly [number, number, number];
  heading: readonly [number, number, number];
  moving: boolean;
  grounded: boolean;
}): FlatWorldNavigationSnapshot {
  const frozenPosition = freezeVector3(...position);
  const frozenHeading = freezeVector3(...heading);
  const navigationRegion = freezeNavigationRegion(
    getNavigationRegionAt(position) ?? getFallbackNavigationRegion()
  );
  const currentZoneId = navigationRegion.displayZoneId;
  const zone = RPG_WORLD_ZONES.find(({ id }) => id === currentZoneId)!;
  const logicalCamera = Object.freeze({
    anchor: freezeVector3(zone.cameraAnchor[0], 0, zone.cameraAnchor[1]),
    player: frozenPosition,
    heading: frozenHeading
  });

  return Object.freeze({
    revision,
    position: frozenPosition,
    surfaceNormal: UP_VECTOR,
    heading: frozenHeading,
    moving,
    grounded,
    logicalCamera,
    navigationRegion,
    navigationRegionId: navigationRegion.regionId,
    transitionProgress:
      navigationRegion.kind === "transition"
        ? navigationRegion.progress
        : null,
    currentZoneId,
    highlightedZoneIds: navigationRegion.highlightedZoneIds,
    destinationId: currentZoneId
  });
}

export function createInitialFlatWorldNavigationSnapshot() {
  return createNavigationSnapshot({
    revision: 0,
    position: RPG_WORLD_SPAWN,
    heading: [1, 0, 0],
    moving: false,
    grounded: true
  });
}

function resolveCanonicalFastTravelDestination(
  destinationId: DestinationId
): FlatWorldFastTravelDestination | null {
  if (!RPG_WORLD_ZONE_IDS.some((zoneId) => zoneId === destinationId)) {
    return null;
  }
  const arrival = getArrival(destinationId);
  return {
    position: arrival.position,
    heading: arrival.heading
  };
}

export function getFlatWorldAdvanceSeconds(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return 0;
  }
  return Math.min(deltaSeconds, MAX_PLAYER_FRAME_SECONDS);
}

function writeTuple(
  target: [number, number, number],
  x: number,
  y: number,
  z: number
) {
  target[0] = x;
  target[1] = y;
  target[2] = z;
}

export function createFlatWorldSnapshot(): WorldSnapshot {
  return {
    position: [0, 0, 0],
    surfaceNormal: [0, 1, 0],
    heading: [1, 0, 0],
    moving: false,
    grounded: true
  };
}

export function createFlatWorldSession({
  bounds,
  start,
  moveSpeed,
  canMoveTo = () => true,
  resolveFastTravelDestination = resolveCanonicalFastTravelDestination
}: FlatWorldSessionOptions): FlatWorldSession {
  const movement: MovementIntent = { x: 0, y: 0 };
  let jumpVelocity = 0;
  let navigation = createNavigationSnapshot({
    revision: 0,
    position: [
      clamp(start.x, bounds.minimumX, bounds.maximumX),
      0,
      clamp(start.z, bounds.minimumZ, bounds.maximumZ)
    ],
    heading: [1, 0, 0],
    moving: false,
    grounded: true
  });

  const readSnapshot = (target: WorldSnapshot) => {
    writeTuple(target.position, ...navigation.position);
    writeTuple(target.surfaceNormal, ...navigation.surfaceNormal);
    writeTuple(target.heading, ...navigation.heading);
    target.moving = navigation.moving;
    target.grounded = navigation.grounded;
    return target;
  };

  const findLanding = (targetX: number, targetZ: number) => {
    if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) {
      return null;
    }
    const centerX = clamp(targetX, bounds.minimumX, bounds.maximumX);
    const centerZ = clamp(targetZ, bounds.minimumZ, bounds.maximumZ);
    if (canMoveTo(centerX, centerZ)) {
      return [centerX, centerZ] as const;
    }
    for (
      let radius = TELEPORT_SEARCH_STEP;
      radius <= TELEPORT_SEARCH_MAX_RADIUS;
      radius += TELEPORT_SEARCH_STEP
    ) {
      for (
        let direction = 0;
        direction < TELEPORT_SEARCH_DIRECTIONS;
        direction += 1
      ) {
        const angle = (direction / TELEPORT_SEARCH_DIRECTIONS) * Math.PI * 2;
        const candidateX = clamp(
          centerX + Math.cos(angle) * radius,
          bounds.minimumX,
          bounds.maximumX
        );
        const candidateZ = clamp(
          centerZ + Math.sin(angle) * radius,
          bounds.minimumZ,
          bounds.maximumZ
        );
        if (canMoveTo(candidateX, candidateZ)) {
          return [candidateX, candidateZ] as const;
        }
      }
    }
    return null;
  };

  const normalizeHeading = (
    heading: { x: number; z: number } | readonly [number, number]
  ) => {
    const x = "x" in heading ? heading.x : heading[0];
    const z = "z" in heading ? heading.z : heading[1];
    const length = Math.hypot(x, z);
    return Number.isFinite(length) && length > 1e-6
      ? ([x / length, 0, z / length] as const)
      : null;
  };

  const prepareFastTravel = (destinationId: DestinationId) => {
    if (!RPG_WORLD_ZONE_IDS.some((zoneId) => zoneId === destinationId)) {
      return null;
    }
    const destination = resolveFastTravelDestination(destinationId);
    if (!destination) {
      return null;
    }
    const landing = findLanding(
      destination.position[0],
      destination.position[2]
    );
    const heading = normalizeHeading(destination.heading);
    if (!landing || !heading) {
      return null;
    }
    const nextNavigation = createNavigationSnapshot({
      revision: navigation.revision + 1,
      position: [landing[0], 0, landing[1]],
      heading,
      moving: false,
      grounded: true
    });
    return nextNavigation.currentZoneId === destinationId
      ? nextNavigation
      : null;
  };

  return {
    setMovement(intent) {
      const length = Math.hypot(intent.x, intent.y);
      const scale = length > 1 ? 1 / length : 1;
      movement.x = intent.x * scale;
      movement.y = intent.y * scale;
    },

    jump() {
      if (!navigation.grounded) {
        return;
      }
      jumpVelocity = 6;
      navigation = createNavigationSnapshot({
        revision: navigation.revision + 1,
        position: navigation.position,
        heading: navigation.heading,
        moving: navigation.moving,
        grounded: false
      });
    },

    reset() {
      movement.x = 0;
      movement.y = 0;
      jumpVelocity = 0;
      navigation = createNavigationSnapshot({
        revision: navigation.revision + 1,
        position: [
          clamp(start.x, bounds.minimumX, bounds.maximumX),
          0,
          clamp(start.z, bounds.minimumZ, bounds.maximumZ)
        ],
        heading: [1, 0, 0],
        moving: false,
        grounded: true
      });
    },

    teleport(targetX, targetZ, heading) {
      try {
        const landing = findLanding(targetX, targetZ);
        if (!landing) {
          return false;
        }
        const nextHeading = heading
          ? normalizeHeading(heading) ?? navigation.heading
          : navigation.heading;
        const nextNavigation = createNavigationSnapshot({
          revision: navigation.revision + 1,
          position: [landing[0], 0, landing[1]],
          heading: nextHeading,
          moving: false,
          grounded: true
        });
        navigation = nextNavigation;
        movement.x = 0;
        movement.y = 0;
        jumpVelocity = 0;
        return true;
      } catch {
        return false;
      }
    },

    fastTravel(destinationId) {
      const previousNavigation = navigation;
      try {
        const nextNavigation = prepareFastTravel(destinationId);
        if (!nextNavigation) {
          return previousNavigation;
        }
        navigation = nextNavigation;
        movement.x = 0;
        movement.y = 0;
        jumpVelocity = 0;
        return navigation;
      } catch {
        return previousNavigation;
      }
    },

    advance(deltaSeconds) {
      if (deltaSeconds <= 0) {
        return;
      }

      let x = navigation.position[0];
      let z = navigation.position[2];
      let headingX = navigation.heading[0];
      let headingZ = navigation.heading[2];
      let jumpHeight = navigation.position[1];
      let grounded = navigation.grounded;
      const strength = Math.hypot(movement.x, movement.y);
      if (strength > 0) {
        const directionX = movement.x / strength;
        const directionZ = -movement.y / strength;
        headingX = directionX;
        headingZ = directionZ;
        const travelDistance = moveSpeed * strength * deltaSeconds;
        const stepCount = Math.max(
          1,
          Math.ceil(travelDistance / MAX_COLLISION_STEP)
        );
        const stepDistance = travelDistance / stepCount;

        for (let step = 0; step < stepCount; step += 1) {
          const nextX = clamp(
            x + directionX * stepDistance,
            bounds.minimumX,
            bounds.maximumX
          );
          const nextZ = clamp(
            z + directionZ * stepDistance,
            bounds.minimumZ,
            bounds.maximumZ
          );
          if (canMoveTo(nextX, nextZ)) {
            x = nextX;
            z = nextZ;
            continue;
          }

          let movedAlongEdge = false;
          if (canMoveTo(nextX, z)) {
            x = nextX;
            movedAlongEdge = true;
          }
          if (canMoveTo(x, nextZ)) {
            z = nextZ;
            movedAlongEdge = true;
          }
          if (!movedAlongEdge) break;
        }
      }

      if (!grounded) {
        jumpVelocity -= 15 * deltaSeconds;
        jumpHeight += jumpVelocity * deltaSeconds;
        if (jumpHeight <= 0) {
          jumpHeight = 0;
          jumpVelocity = 0;
          grounded = true;
        }
      }

      const moving = strength > 0;
      if (
        x === navigation.position[0] &&
        z === navigation.position[2] &&
        jumpHeight === navigation.position[1] &&
        headingX === navigation.heading[0] &&
        headingZ === navigation.heading[2] &&
        moving === navigation.moving &&
        grounded === navigation.grounded
      ) {
        return;
      }
      navigation = createNavigationSnapshot({
        revision: navigation.revision + 1,
        position: [x, jumpHeight, z],
        heading: [headingX, 0, headingZ],
        moving,
        grounded
      });
    },

    readSnapshot,

    getSnapshot() {
      return readSnapshot(createFlatWorldSnapshot());
    },

    getNavigationSnapshot() {
      return navigation;
    }
  };
}
