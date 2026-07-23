export interface RpgEnvironmentCloudRoute {
  baseX: number;
  minX: number;
  maxX: number;
  speed: number;
}

export interface RpgEnvironmentMotionFrame {
  cloudX: number;
  busBobY: number;
  busHeadlightIntensity: number;
  lanternGlowIntensity: number;
  lanternSwayZ: number;
  cityWindowEmissiveIntensity: number;
  stallCanopySwayX: number;
  stallBannerSwayZ: number;
}

export function createRpgEnvironmentMotionFrame(): RpgEnvironmentMotionFrame {
  return {
    cloudX: 0,
    busBobY: 0,
    busHeadlightIntensity: 0.65,
    lanternGlowIntensity: 0.79,
    lanternSwayZ: 0,
    cityWindowEmissiveIntensity: 0.51,
    stallCanopySwayX: 0,
    stallBannerSwayZ: 0
  };
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function cycleSine(elapsedSeconds: number, periodSeconds: number, phase: number) {
  const progress = positiveModulo(elapsedSeconds, periodSeconds) / periodSeconds;
  return Math.sin((progress + phase) * Math.PI * 2);
}

export function evaluateRpgEnvironmentMotionInto(
  elapsedSeconds: number,
  variant: number,
  reducedMotion: boolean,
  cloudRoute: RpgEnvironmentCloudRoute,
  target: RpgEnvironmentMotionFrame
): RpgEnvironmentMotionFrame {
  const safeElapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const safeVariant = Number.isFinite(variant)
    ? positiveModulo(Math.trunc(variant), 1024)
    : 0;
  if (reducedMotion) {
    target.cloudX = cloudRoute.baseX;
    target.busBobY = 0;
    target.busHeadlightIntensity = 0.58;
    target.lanternGlowIntensity = 0.72;
    target.lanternSwayZ = 0;
    target.cityWindowEmissiveIntensity = 0.46;
    target.stallCanopySwayX = 0;
    target.stallBannerSwayZ = 0;
    return target;
  }
  const range = cloudRoute.maxX - cloudRoute.minX;
  const period = range / Math.abs(cloudRoute.speed);
  const wrappedTime = positiveModulo(safeElapsed, period);
  const travelled = wrappedTime * cloudRoute.speed;
  target.cloudX =
    cloudRoute.minX +
    positiveModulo(cloudRoute.baseX - cloudRoute.minX + travelled, range);
  target.busBobY =
    cycleSine(safeElapsed, 3.2, safeVariant * 0.071) * 0.022;
  target.busHeadlightIntensity =
    0.65 + cycleSine(safeElapsed, 2.4, safeVariant * 0.113) * 0.13;
  target.lanternGlowIntensity =
    0.79 + cycleSine(safeElapsed, 2.8, safeVariant * 0.137) * 0.15;
  target.lanternSwayZ =
    cycleSine(safeElapsed, 4.6, safeVariant * 0.173) * 0.026;
  target.cityWindowEmissiveIntensity =
    0.51 + cycleSine(safeElapsed, 9, safeVariant * 0.097) * 0.21;
  target.stallCanopySwayX =
    cycleSine(safeElapsed, 5.2, safeVariant * 0.149) * 0.016;
  target.stallBannerSwayZ =
    cycleSine(safeElapsed, 3.8, safeVariant * 0.191 + 0.17) * 0.044;
  return target;
}
