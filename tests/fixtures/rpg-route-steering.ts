export interface RpgRoutePulsePlan {
  readonly desiredNextDistance: number;
  readonly candidates: readonly number[];
}

export const RPG_ROUTE_STALL_FRAME_LIMIT = 8;

export type RpgRouteKeyboardKey = "a" | "d" | "s" | "w";

export function advanceRpgRouteStallState(
  previousPosition: string,
  currentPosition: string,
  unchangedFrames: number
) {
  const nextUnchangedFrames =
    currentPosition === previousPosition ? unchangedFrames + 1 : 0;
  return {
    position: currentPosition,
    unchangedFrames: nextUnchangedFrames,
    stalled: nextUnchangedFrames >= RPG_ROUTE_STALL_FRAME_LIMIT
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function medianRpgRoutePulse(
  values: readonly number[],
  fallback: number
) {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function getRpgRouteReleaseLeadDistance({
  carrySamples,
  lastStep,
  tolerance
}: {
  carrySamples: readonly number[];
  lastStep: number;
  tolerance: number;
}) {
  const safeLastStep = Math.max(0, lastStep);
  return carrySamples.length === 0
    ? tolerance
    : medianRpgRoutePulse(carrySamples, 0) + safeLastStep / 2;
}

export function mergeRpgRoutePulseFeedback(
  previous: readonly number[],
  observed: readonly number[]
) {
  return [...previous, ...observed]
    .filter((step) => Number.isFinite(step) && step > Number.EPSILON)
    .slice(-3);
}

/**
 * Which way to swing, and whether to walk yet.
 *
 * The visitor travels along the way they face, so a bearing is turned toward
 * rather than pressed sideways into. Pressing "a" raises the yaw and "d" lowers
 * it, the same hand a drag turns.
 */
export function selectRpgRouteKeyboardPulse({
  cameraYaw,
  desiredWorldYaw,
  toleranceRadians = (3 * Math.PI) / 180
}: {
  cameraYaw: number;
  desiredWorldYaw: number;
  toleranceRadians?: number;
}) {
  const error = Math.atan2(
    Math.sin(desiredWorldYaw - cameraYaw),
    Math.cos(desiredWorldYaw - cameraYaw)
  );
  const aligned = Math.abs(error) <= toleranceRadians;
  return {
    error,
    aligned,
    keys: (aligned
      ? ["w"]
      : [error > 0 ? "a" : "d"]) as readonly RpgRouteKeyboardKey[]
  };
}

export async function runBalancedRpgRouteKeyboardPulse<T>({
  keys,
  keyDown,
  keyUp,
  observe
}: {
  keys: readonly RpgRouteKeyboardKey[];
  keyDown: (key: RpgRouteKeyboardKey) => Promise<void>;
  keyUp: (key: RpgRouteKeyboardKey) => Promise<void>;
  observe: () => Promise<T>;
}) {
  const pressed: RpgRouteKeyboardKey[] = [];
  try {
    for (const key of keys) {
      await keyDown(key);
      pressed.push(key);
    }
    return await observe();
  } finally {
    for (const key of pressed.reverse()) {
      await keyUp(key);
    }
  }
}

export function getRpgRouteBrakeRadius(
  recentSteps: readonly number[]
) {
  return Math.max(0.6, 2 * Math.max(0, ...recentSteps));
}

export function planRpgRoutePulse({
  distance,
  predictedStep,
  tolerance,
  directYaw,
  mirrorSign
}: {
  distance: number;
  predictedStep: number;
  tolerance: number;
  directYaw: number;
  mirrorSign: -1 | 1;
}): RpgRoutePulsePlan {
  const safeDistance = Math.max(Number.EPSILON, distance);
  const safeStep = Math.max(Number.EPSILON, predictedStep);
  const targetRadius = tolerance / 2;
  const desiredNextDistance =
    Math.abs(safeDistance - safeStep) <= targetRadius
      ? targetRadius
      : safeDistance > safeStep + targetRadius
        ? safeDistance - safeStep
        : safeStep;
  const cosine = clamp(
    (safeDistance ** 2 +
      safeStep ** 2 -
      desiredNextDistance ** 2) /
      (2 * safeDistance * safeStep),
    -1,
    1
  );
  const offset = Math.acos(cosine);
  return {
    desiredNextDistance,
    candidates: [
      directYaw + mirrorSign * offset,
      directYaw - mirrorSign * offset,
      directYaw + Math.PI,
      directYaw
    ]
  };
}
