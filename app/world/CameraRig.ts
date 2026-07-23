import {
  FLAT_CAMERA_MAX_STEP_CSS_PX,
  type FlatCameraFeasibleInterval
} from "./FlatCameraPlacement";

export interface CameraDrag {
  readonly deltaX: number;
  readonly deltaY: number;
}

/**
 * Compatibility snapshot for the current canvas bridge. Fixed-backdrop mode
 * never mutates these angles; Lane 6 can remove the bridge with the old view.
 */
export interface CameraSnapshot {
  yaw: number;
  pitch: number;
}

interface CameraRigOptions {
  readonly initialYaw: number;
  readonly initialPitch: number;
  readonly degreesPerPixel: number;
}

export interface FlatCameraTemporalStepInput {
  readonly currentSourceOffsetX: number;
  readonly targetSourceOffsetX: number;
  readonly backdropScale: number;
  readonly nextFeasibleInterval: FlatCameraFeasibleInterval;
}

export interface FlatCameraTemporalStep {
  readonly sourceOffsetX: number;
  readonly movementCssPixels: number;
  readonly feasibleIntersection: FlatCameraFeasibleInterval;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Advances a crop only inside the intersection of the next frame's valid
 * interval and the 24 CSS-pixel reachable range. A missing intersection is a
 * fail-closed signal to the caller instead of a broken frame.
 */
export function stepFlatCameraSourceOffset({
  currentSourceOffsetX,
  targetSourceOffsetX,
  backdropScale,
  nextFeasibleInterval
}: FlatCameraTemporalStepInput): FlatCameraTemporalStep | null {
  if (
    ![
      currentSourceOffsetX,
      targetSourceOffsetX,
      backdropScale,
      nextFeasibleInterval.minimumX,
      nextFeasibleInterval.maximumX
    ].every(Number.isFinite) ||
    backdropScale <= 0 ||
    nextFeasibleInterval.minimumX > nextFeasibleInterval.maximumX
  ) {
    return null;
  }

  const maximumSourceStep = FLAT_CAMERA_MAX_STEP_CSS_PX / backdropScale;
  const feasibleIntersection = {
    minimumX: Math.max(
      nextFeasibleInterval.minimumX,
      currentSourceOffsetX - maximumSourceStep
    ),
    maximumX: Math.min(
      nextFeasibleInterval.maximumX,
      currentSourceOffsetX + maximumSourceStep
    )
  };
  if (feasibleIntersection.minimumX > feasibleIntersection.maximumX) {
    return null;
  }

  const sourceOffsetX = clamp(
    targetSourceOffsetX,
    feasibleIntersection.minimumX,
    feasibleIntersection.maximumX
  );
  return {
    sourceOffsetX,
    movementCssPixels:
      Math.abs(sourceOffsetX - currentSourceOffsetX) * backdropScale,
    feasibleIntersection
  };
}

/**
 * Pointer lifecycle compatibility while the fixed-backdrop renderer lands.
 * Drag and reset intentionally cannot rotate or pitch the camera.
 */
export function createCameraRig(options: CameraRigOptions) {
  void options;
  let dragging = false;
  const snapshot = { yaw: 0, pitch: 0 };

  return {
    beginDrag() {
      dragging = true;
    },
    endDrag() {
      dragging = false;
    },
    isDragging() {
      return dragging;
    },
    drag(drag: CameraDrag) {
      void drag;
    },
    reset() {},
    consumeReset() {
      return false;
    },
    readSnapshot(target: CameraSnapshot): CameraSnapshot {
      target.yaw = snapshot.yaw;
      target.pitch = snapshot.pitch;
      return target;
    },
    getSnapshot(): CameraSnapshot {
      return { ...snapshot };
    }
  };
}
