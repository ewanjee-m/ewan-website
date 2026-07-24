export interface RpgCameraContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RpgCameraSafeArea {
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
  width: number;
  height: number;
}

export interface RpgCameraProjectedBounds {
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
}

export interface RpgCameraSafetyCorrection {
  x: number;
  y: number;
}

function stableMetric(value: number) {
  return Number(value.toFixed(12));
}

export function advanceRpgCameraSafetyViolation(
  violationSeconds: number,
  correction: Readonly<RpgCameraSafetyCorrection>,
  deltaSeconds: number
) {
  if (correction.x === 0 && correction.y === 0) {
    return 0;
  }
  const elapsed =
    Number.isFinite(violationSeconds) && violationSeconds > 0
      ? violationSeconds
      : 0;
  const delta =
    Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  return stableMetric(elapsed + delta);
}

export function getRpgCameraSafeArea(
  viewport: "desktop" | "mobile",
  contentRect: Readonly<RpgCameraContentRect>
): RpgCameraSafeArea {
  const horizontalInset = viewport === "mobile" ? 0.1 : 0.15;
  const topInset = viewport === "mobile" ? 0.08 : 0.1;
  const bottomEdge = viewport === "mobile" ? 0.94 : 0.92;
  const minimumX = contentRect.x + contentRect.width * horizontalInset;
  const maximumX = contentRect.x + contentRect.width * (1 - horizontalInset);
  const minimumY = contentRect.y + contentRect.height * topInset;
  const maximumY = contentRect.y + contentRect.height * bottomEdge;

  return {
    minimumX: stableMetric(minimumX),
    maximumX: stableMetric(maximumX),
    minimumY: stableMetric(minimumY),
    maximumY: stableMetric(maximumY),
    width: stableMetric(maximumX - minimumX),
    height: stableMetric(maximumY - minimumY)
  };
}

function clampCorrection(value: number) {
  return Math.min(1, Math.max(-1, value));
}

function largerSignedOverflow(negative: number, positive: number) {
  return Math.abs(negative) > Math.abs(positive) ? negative : positive;
}

export function calculateRpgCameraSafetyCorrection(
  bounds: Readonly<RpgCameraProjectedBounds>,
  safeArea: Readonly<RpgCameraSafeArea>
): RpgCameraSafetyCorrection {
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    !Object.values(safeArea).every(Number.isFinite) ||
    safeArea.width <= 0 ||
    safeArea.height <= 0
  ) {
    return { x: 0, y: 0 };
  }

  const leftOverflow = Math.min(0, bounds.minimumX - safeArea.minimumX);
  const rightOverflow = Math.max(0, bounds.maximumX - safeArea.maximumX);
  const topOverflow = Math.min(0, bounds.minimumY - safeArea.minimumY);
  const bottomOverflow = Math.max(0, bounds.maximumY - safeArea.maximumY);

  return {
    x: stableMetric(
      clampCorrection(
        largerSignedOverflow(leftOverflow, rightOverflow) / safeArea.width
      )
    ),
    y: stableMetric(
      clampCorrection(
        largerSignedOverflow(topOverflow, bottomOverflow) / safeArea.height
      )
    )
  };
}
