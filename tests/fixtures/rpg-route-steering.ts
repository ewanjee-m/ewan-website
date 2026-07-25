import { resolveCameraRelativeDirection } from "../../app/world/WorldRuntime";

export interface RpgRoutePulsePlan {
  readonly desiredNextDistance: number;
  readonly candidates: readonly number[];
}

export const RPG_ROUTE_STALL_FRAME_LIMIT = 8;

export type RpgRouteKeyboardKey = "a" | "d" | "s" | "w";

const RPG_ROUTE_KEYBOARD_INPUTS = [
  { keys: ["w"], inputX: 0, inputY: 1 },
  { keys: ["d", "w"], inputX: Math.SQRT1_2, inputY: Math.SQRT1_2 },
  { keys: ["d"], inputX: 1, inputY: 0 },
  { keys: ["d", "s"], inputX: Math.SQRT1_2, inputY: -Math.SQRT1_2 },
  { keys: ["s"], inputX: 0, inputY: -1 },
  { keys: ["a", "s"], inputX: -Math.SQRT1_2, inputY: -Math.SQRT1_2 },
  { keys: ["a"], inputX: -1, inputY: 0 },
  { keys: ["a", "w"], inputX: -Math.SQRT1_2, inputY: Math.SQRT1_2 }
] as const satisfies readonly {
  keys: readonly RpgRouteKeyboardKey[];
  inputX: number;
  inputY: number;
}[];

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

export function selectRpgRouteKeyboardPulse(
  cameraYaw: number,
  desiredWorldYaw: number
) {
  return rankRpgRouteKeyboardPulses(cameraYaw, desiredWorldYaw)[0];
}

export function rankRpgRouteKeyboardPulses(
  cameraYaw: number,
  desiredWorldYaw: number
) {
  const desiredX = Math.sin(desiredWorldYaw);
  const desiredZ = Math.cos(desiredWorldYaw);
  return RPG_ROUTE_KEYBOARD_INPUTS.map((candidate) => {
    // Ask the runtime where a key press actually goes rather than restating
    // the mapping here. A private copy of this maths is what let the lateral
    // axis stay mirrored for so long.
    const { x: worldX, z: worldZ } = resolveCameraRelativeDirection(
      { x: candidate.inputX, y: candidate.inputY, runRequested: false },
      cameraYaw
    );
    const alignment = worldX * desiredX + worldZ * desiredZ;
    return {
      keys: candidate.keys,
      inputX: candidate.inputX,
      inputY: candidate.inputY,
      worldX,
      worldZ,
      alignment
    };
  }).sort((left, right) => right.alignment - left.alignment);
}

export function rankRpgRouteKeyboardPulsesByRadius({
  cameraYaw,
  desiredWorldYaw,
  targetDeltaX,
  targetDeltaZ,
  predictedStep,
  desiredNextDistance
}: {
  cameraYaw: number;
  desiredWorldYaw: number;
  targetDeltaX: number;
  targetDeltaZ: number;
  predictedStep: number;
  desiredNextDistance: number;
}) {
  return rankRpgRouteKeyboardPulses(
    cameraYaw,
    desiredWorldYaw
  )
    .map((candidate) => {
      const predictedRadius = Math.hypot(
        targetDeltaX - candidate.worldX * predictedStep,
        targetDeltaZ - candidate.worldZ * predictedStep
      );
      return {
        ...candidate,
        predictedRadius,
        radiusError: Math.abs(
          predictedRadius - desiredNextDistance
        )
      };
    })
    .sort(
      (left, right) =>
        left.radiusError - right.radiusError ||
        right.alignment - left.alignment
    );
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
