import type { MovementIntent } from "./WorldSession";
import {
  createRpgWorldPoint,
  unprojectRpgScreenDirectionToWorldInto
} from "./RpgWorldTransform";
import {
  RPG_WORLD_SPAWN,
  type WorldPoint2,
  type WorldPoint3
} from "./RpgWorldModel";

export interface RpgScreenMovementTelemetry {
  usedCompatibilityWorldPosition: boolean;
}

export interface RpgScreenMovementInput {
  screen: Readonly<MovementIntent>;
  /** @deprecated Camera yaw no longer controls reference-image movement. */
  cameraAzimuthDegrees: number;
  /** Current logical player position used for the local measured inverse. */
  worldPosition?: WorldPoint2 | WorldPoint3;
  /** Optional caller-owned proof that the live current position was supplied. */
  telemetry?: RpgScreenMovementTelemetry;
}

export function createRpgMovementBuffer(): MovementIntent {
  return { x: 0, y: 0 };
}

export function createRpgScreenMovementTelemetry(): RpgScreenMovementTelemetry {
  return { usedCompatibilityWorldPosition: true };
}

// Below this the stick is at rest and nothing is being asked of the camera.
const MOVEMENT_DEADZONE = 0.001;

/**
 * The chase camera swings in behind whichever way the visitor walks, the way a
 * role playing game does, rather than only when they walk forward. Walking
 * right turns the view right.
 */
export function shouldAutoFollowRpgCharacterHeading(
  screen: Readonly<MovementIntent>,
  dragging = false
) {
  if (dragging) {
    return false;
  }
  const horizontal = Number.isFinite(screen.x) ? screen.x : 0;
  const vertical = Number.isFinite(screen.y) ? screen.y : 0;
  return Math.hypot(horizontal, vertical) > MOVEMENT_DEADZONE;
}

export interface RpgMovementAzimuthLatch {
  held: boolean;
  azimuthDegrees: number;
  inputAngleDegrees: number;
}

export function createRpgMovementAzimuthLatch(): RpgMovementAzimuthLatch {
  return { held: false, azimuthDegrees: 0, inputAngleDegrees: 0 };
}

/** How far the stick has to swing before the walk takes a new bearing. */
export const RPG_MOVEMENT_RELATCH_DEGREES = 30;

function normalizeDegrees(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

/**
 * Retains the legacy camera-bearing latch for caller compatibility. Measured
 * screen movement does not consume this bearing; current world position is its
 * only local mapping context.
 *
 * @deprecated Pass `worldPosition` to `mapRpgScreenMovementInto` instead.
 */
export function latchRpgMovementAzimuth(
  latch: RpgMovementAzimuthLatch,
  screen: Readonly<MovementIntent>,
  cameraViewYawDegrees: number
): number {
  const x = Number.isFinite(screen.x) ? screen.x : 0;
  const y = Number.isFinite(screen.y) ? screen.y : 0;
  const cameraYaw = Number.isFinite(cameraViewYawDegrees)
    ? cameraViewYawDegrees
    : 0;

  if (Math.hypot(x, y) <= MOVEMENT_DEADZONE) {
    latch.held = false;
    return cameraYaw;
  }

  const inputAngle = (Math.atan2(x, y) * 180) / Math.PI;
  const swung =
    latch.held &&
    Math.abs(normalizeDegrees(inputAngle - latch.inputAngleDegrees)) >
      RPG_MOVEMENT_RELATCH_DEGREES;

  if (!latch.held || swung) {
    latch.held = true;
    latch.azimuthDegrees = cameraYaw;
    latch.inputAngleDegrees = inputAngle;
  }

  return latch.azimuthDegrees;
}

export function calculateRpgChaseMovementAzimuth(
  renderedHeadingYawDegrees: number,
  orbitYawDegrees: number
) {
  const safeHeadingYaw = Number.isFinite(renderedHeadingYawDegrees)
    ? renderedHeadingYawDegrees
    : 0;
  const safeOrbitYaw = Number.isFinite(orbitYawDegrees)
    ? orbitYawDegrees
    : 0;
  return normalizeDegrees(safeHeadingYaw + safeOrbitYaw);
}

const WORLD_DIRECTION_BUFFER = createRpgWorldPoint();

export function mapRpgScreenMovementInto(
  { screen, worldPosition, telemetry }: RpgScreenMovementInput,
  target: MovementIntent
): MovementIntent {
  const usedCompatibilityWorldPosition = worldPosition === undefined;
  if (telemetry) {
    telemetry.usedCompatibilityWorldPosition = usedCompatibilityWorldPosition;
  }
  if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
    target.x = 0;
    target.y = 0;
    return target;
  }
  const length = Math.hypot(screen.x, screen.y);
  if (length === 0) {
    target.x = 0;
    target.y = 0;
    return target;
  }
  const strength = Math.min(1, length);
  const worldDirection = unprojectRpgScreenDirectionToWorldInto(
    worldPosition ?? RPG_WORLD_SPAWN,
    {
      x: screen.x / length,
      // MovementIntent keeps its existing convention: +y is screen up.
      y: -screen.y / length
    },
    WORLD_DIRECTION_BUFFER
  );
  if (!worldDirection) {
    target.x = 0;
    target.y = 0;
    return target;
  }
  target.x = worldDirection[0] * strength;
  target.y = -worldDirection[2] * strength;
  return target;
}
