export type NpcFacing = -1 | 1;

export interface NpcMotionPose {
  offsetX: number;
  scaleY: number;
  rotationZ: number;
  facing: NpcFacing;
}

const WALK_PERIOD_SECONDS = 4.8;
const BREATH_PERIOD_SECONDS = 3.6;
const GREETING_PERIOD_SECONDS = 5.4;
const REDUCED_IDLE_PERIOD_SECONDS = 6;
const FULL_TURN_RADIANS = Math.PI * 2;

function normalizeVariant(variant: number) {
  return Number.isFinite(variant) ? Math.max(0, Math.trunc(variant)) : 0;
}

function cycleProgress(elapsedSeconds: number, offsetSeconds: number, period: number) {
  const safeElapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  return ((safeElapsed + offsetSeconds) % period) / period;
}

export function createNpcMotionPose(): NpcMotionPose {
  return {
    offsetX: 0,
    scaleY: 1,
    rotationZ: 0,
    facing: 1
  };
}

export function evaluateNpcMotionInto(
  variant: number,
  elapsedSeconds: number,
  reducedMotion: boolean,
  target: NpcMotionPose
) {
  const safeVariant = normalizeVariant(variant);
  const baseFacing: NpcFacing = safeVariant % 2 === 0 ? 1 : -1;
  target.offsetX = 0;
  target.scaleY = 1;
  target.rotationZ = 0;
  target.facing = baseFacing;

  if (reducedMotion) {
    const progress = cycleProgress(
      elapsedSeconds,
      safeVariant * 0.239,
      REDUCED_IDLE_PERIOD_SECONDS
    );
    target.scaleY =
      1 + Math.sin(progress * FULL_TURN_RADIANS) * 0.0015;
    return target;
  }

  const motionKind = safeVariant % 3;
  if (motionKind === 1) {
    const progress = cycleProgress(
      elapsedSeconds,
      safeVariant * 0.173,
      BREATH_PERIOD_SECONDS
    );
    const angle = progress * FULL_TURN_RADIANS;
    target.scaleY = 1 + Math.sin(angle) * 0.009;
    target.rotationZ = Math.cos(angle) * 0.012;
    return target;
  }

  if (motionKind === 2) {
    const progress = cycleProgress(
      elapsedSeconds,
      safeVariant * 0.211,
      GREETING_PERIOD_SECONDS
    );
    const bowWave = Math.max(
      0,
      Math.sin(progress * FULL_TURN_RADIANS)
    );
    const bow = bowWave * bowWave;
    target.scaleY = 1 - bow * 0.06;
    target.rotationZ = baseFacing * bow * 0.021;
    return target;
  }

  const progress = cycleProgress(
    elapsedSeconds,
    safeVariant * 0.137,
    WALK_PERIOD_SECONDS
  );
  const amplitude = 0.18 + (Math.floor(safeVariant / 3) % 3) * 0.025;
  const routeProgress =
    progress < 0.5 ? progress * 2 : (1 - progress) * 2;
  target.offsetX = -amplitude + routeProgress * amplitude * 2;
  target.facing = progress < 0.5 ? 1 : -1;
  return target;
}
