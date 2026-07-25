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
import {
  createChaseOrbitCameraState,
  getChaseOrbitCameraBasis
} from "./ChaseOrbitCamera";
import { findWorldInteractionTarget } from "./WorldInteraction";

// Paced against the character rather than against a stopwatch. At 2.6 units
// tall these are 1.15 and 2.69 body heights a second, so a walk is brisk and
// the run key is actually felt. The previous 1.61 and 1.9 put the run below a
// normal person's walking pace and took 76 seconds to cross the world.
export const WORLD_WALK_SPEED = 3;
export const WORLD_RUN_SPEED = 7;
const MAX_STEP = 0.25;
const JUMP_VELOCITY = 6;
const GRAVITY = 15;

/**
 * Where a movement intent carries the visitor.
 *
 * Only the forward axis moves anybody: the left-right axis turns them, and it
 * is spent on the camera's yaw before this is called. So travel is always
 * along the way they are facing, forwards or backwards, and never sideways.
 * That is what lets the view sit behind their eyes at every moment — a
 * sideways walk is exactly the case where the two cannot agree.
 */
export function resolveCameraRelativeDirection(
  intent: Readonly<WorldMovementIntent>,
  yaw: number
) {
  if (!Number.isFinite(intent.y)) return { x: 0, z: 0, strength: 0 };
  const forward = Math.min(1, Math.max(-1, intent.y));
  const strength = Math.abs(forward);
  if (strength <= 1e-8) return { x: 0, z: 0, strength: 0 };
  const basis = getChaseOrbitCameraBasis(yaw);
  const sign = forward < 0 ? -1 : 1;
  return {
    x: basis.forwardX * sign,
    z: basis.forwardZ * sign,
    strength
  };
}

export interface WorldRuntimeOptions {
  canOccupyDynamic?: (position: readonly [number, number]) => boolean;
  unavailableInteractionTargetIds?: ReadonlySet<string>;
}

export function isWorldRuntimeWalkablePosition(
  position: readonly [number, number]
) {
  return isWalkable(position);
}

export function createWorldRuntime(options: WorldRuntimeOptions = {}) {
  const movement: WorldMovementIntent = { x: 0, y: 0, runRequested: false };
  const cameraState = createChaseOrbitCameraState();
  let x = RPG_WORLD_SPAWN[0];
  let z = RPG_WORLD_SPAWN[2];
  // The visitor faces wherever the camera looks, so the two agree from the
  // first frame rather than the world opening on their profile.
  const spawnBasis = getChaseOrbitCameraBasis(cameraState.yaw);
  const spawnHeading: WorldPoint3 = [spawnBasis.forwardX, 0, spawnBasis.forwardZ];
  let heading: WorldPoint3 = spawnHeading;
  let jumpOffset = 0;
  let jumpVelocity = 0;
  let revision = 0;
  const unavailableInteractionTargetIds = new Set(
    options.unavailableInteractionTargetIds
  );
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
    // Turning on the spot is not travelling, so the walk cycle does not run
    // while the visitor is only swinging round to look somewhere else.
    const speed = Math.abs(movement.y);
    const nearInteractionId =
      findWorldInteractionTarget({
        position: [x, surfaceHeight + jumpOffset, z],
        heading,
        unavailableTargetIds: unavailableInteractionTargetIds
      })?.id ?? null;
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
      nearInteractionId
    });
  };

  return {
    setMovement(next: Readonly<WorldMovementIntent>) {
      Object.assign(movement, next);
    },
    jump() {
      if (jumpOffset === 0) jumpVelocity = JUMP_VELOCITY;
    },
    reset() {
      x = RPG_WORLD_SPAWN[0];
      z = RPG_WORLD_SPAWN[2];
      heading = spawnHeading;
      jumpOffset = 0;
      jumpVelocity = 0;
      Object.assign(movement, { x: 0, y: 0, runRequested: false });
      Object.assign(cameraState, createChaseOrbitCameraState());
      revision += 1;
    },
    setInteractionTargetAvailable(targetId: string, available: boolean) {
      let changed = false;
      if (available) {
        changed = unavailableInteractionTargetIds.delete(targetId);
      } else if (!unavailableInteractionTargetIds.has(targetId)) {
        unavailableInteractionTargetIds.add(targetId);
        changed = true;
      }
      if (changed) revision += 1;
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
      // Facing follows the view rather than the last step taken, so backing
      // away from something keeps it in sight instead of turning the visitor's
      // back on it.
      const facing = getChaseOrbitCameraBasis(cameraYaw);
      if (facing.forwardX !== heading[0] || facing.forwardZ !== heading[2]) {
        heading = [facing.forwardX, 0, facing.forwardZ];
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
    getNavigationSnapshot: snapshot,
    getCameraState() {
      return cameraState;
    }
  };
}

export type WorldRuntime = ReturnType<typeof createWorldRuntime>;
