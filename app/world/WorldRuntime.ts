import {
  getNavigationRegionAt,
  getSurfaceHeight,
  getSurfaceNormal,
  isWalkable
} from "./RpgWorldGeometry";
import {
  RPG_WORLD_BOUNDS,
  RPG_WORLD_SPAWN,
  type WorldPoint3
} from "./RpgWorldModel";
import type { WorldMovementIntent } from "./WorldInput";
import {
  freezeWorldNavigationRegion,
  type WorldNavigationSnapshot
} from "./WorldNavigationState";

export const WORLD_WALK_SPEED = 1.61;
export const WORLD_RUN_SPEED = 1.9;
const MAX_STEP = 0.25;
const JUMP_VELOCITY = 6;
const GRAVITY = 15;

export function resolveCameraRelativeDirection(
  intent: Readonly<WorldMovementIntent>,
  yaw: number
) {
  const length = Math.hypot(intent.x, intent.y);
  if (length <= 1e-8) return { x: 0, z: 0, strength: 0 };
  const x = intent.x / length;
  const y = intent.y / length;
  return {
    x: x * Math.cos(yaw) + y * Math.sin(yaw),
    z: -x * Math.sin(yaw) + y * Math.cos(yaw),
    strength: Math.min(1, length)
  };
}

export interface WorldRuntimeOptions {
  canOccupyDynamic?: (position: readonly [number, number]) => boolean;
}

export function isWorldRuntimeWalkablePosition(
  position: readonly [number, number]
) {
  return isWalkable(position);
}

export function createWorldRuntime(options: WorldRuntimeOptions = {}) {
  const movement: WorldMovementIntent = { x: 0, y: 0, runRequested: false };
  let x = RPG_WORLD_SPAWN[0];
  let z = RPG_WORLD_SPAWN[2];
  let heading: WorldPoint3 = [1, 0, 0];
  let jumpOffset = 0;
  let jumpVelocity = 0;
  let revision = 0;
  const canOccupy = (position: readonly [number, number]) =>
    isWorldRuntimeWalkablePosition(position) &&
    (options.canOccupyDynamic?.(position) ?? true);

  const snapshot = (): WorldNavigationSnapshot => {
    const resolvedRegion = getNavigationRegionAt([x, z]);
    if (!resolvedRegion) {
      throw new RangeError(`WorldRuntime escaped navigation space at ${x},${z}`);
    }
    const region = freezeWorldNavigationRegion(resolvedRegion);
    const surfaceHeight = getSurfaceHeight([x, z]);
    const grounded = jumpOffset === 0;
    const speed = Math.hypot(movement.x, movement.y);
    return Object.freeze({
      revision,
      position: Object.freeze([x, surfaceHeight + jumpOffset, z] as const),
      surfaceHeight,
      jumpOffset,
      surfaceNormal: Object.freeze(getSurfaceNormal([x, z])),
      heading: Object.freeze(heading),
      moving: speed > 0,
      grounded,
      locomotion: !grounded
        ? "jump"
        : speed === 0
          ? "idle"
          : movement.runRequested
            ? "run"
            : "walk",
      navigationRegion: region,
      navigationRegionId: region.regionId,
      transitionProgress: region.kind === "transition" ? region.progress : null,
      currentZoneId: region.displayZoneId,
      highlightedZoneIds: region.highlightedZoneIds,
      nearInteractionId: null
    });
  };

  return {
    setMovement(next: Readonly<WorldMovementIntent>) {
      const changed =
        next.x !== movement.x ||
        next.y !== movement.y ||
        next.runRequested !== movement.runRequested;
      Object.assign(movement, next);
      if (changed) revision += 1;
    },
    jump() {
      if (jumpOffset === 0) jumpVelocity = JUMP_VELOCITY;
    },
    reset() {
      x = RPG_WORLD_SPAWN[0];
      z = RPG_WORLD_SPAWN[2];
      heading = [1, 0, 0];
      jumpOffset = 0;
      jumpVelocity = 0;
      Object.assign(movement, { x: 0, y: 0, runRequested: false });
      revision += 1;
    },
    advance(deltaSeconds: number, cameraYaw: number) {
      if (!Number.isFinite(deltaSeconds)) return;
      const beforeX = x;
      const beforeZ = z;
      const beforeJumpOffset = jumpOffset;
      const beforeHeadingX = heading[0];
      const beforeHeadingZ = heading[2];
      const delta = Math.min(0.25, Math.max(0, deltaSeconds));
      const direction = resolveCameraRelativeDirection(movement, cameraYaw);
      const speed = movement.runRequested ? WORLD_RUN_SPEED : WORLD_WALK_SPEED;
      const distance = direction.strength * speed * delta;
      const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
      for (let index = 0; index < steps; index += 1) {
        const nextX = Math.min(
          RPG_WORLD_BOUNDS.maximumX,
          Math.max(RPG_WORLD_BOUNDS.minimumX, x + direction.x * distance / steps)
        );
        const nextZ = Math.min(
          RPG_WORLD_BOUNDS.maximumZ,
          Math.max(RPG_WORLD_BOUNDS.minimumZ, z + direction.z * distance / steps)
        );
        if (canOccupy([nextX, nextZ])) {
          x = nextX;
          z = nextZ;
        } else {
          if (canOccupy([nextX, z])) x = nextX;
          if (canOccupy([x, nextZ])) z = nextZ;
        }
      }
      if (direction.strength > 0) {
        heading = [direction.x, 0, direction.z];
      }
      if (jumpVelocity !== 0 || jumpOffset > 0) {
        jumpVelocity -= GRAVITY * delta;
        jumpOffset = Math.max(0, jumpOffset + jumpVelocity * delta);
        if (jumpOffset === 0) jumpVelocity = 0;
      }
      if (
        x !== beforeX ||
        z !== beforeZ ||
        jumpOffset !== beforeJumpOffset ||
        heading[0] !== beforeHeadingX ||
        heading[2] !== beforeHeadingZ
      ) {
        revision += 1;
      }
    },
    getNavigationSnapshot: snapshot
  };
}

export type WorldRuntime = ReturnType<typeof createWorldRuntime>;
