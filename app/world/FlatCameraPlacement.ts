export type FlatCameraProfileId = "desktop" | "mobile";

export interface FlatCameraCssRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FlatCameraReferenceBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
}

export interface FlatCameraProtectedRectangle
  extends FlatCameraReferenceBounds {
  readonly id: string;
  readonly sourceId: string;
}

export interface FlatCameraProfile {
  readonly id: FlatCameraProfileId;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly safeFrame: FlatCameraCssRectangle;
}

export interface FlatCameraFeasibleInterval {
  readonly minimumX: number;
  readonly maximumX: number;
}

export interface FlatCameraProjectedBounds {
  readonly reference: FlatCameraReferenceBounds;
  readonly safeFrame: FlatCameraReferenceBounds;
}

export interface FlatCameraReferenceProjectionInput {
  /** Horizontal crop origin in canonical reference-image pixels. */
  readonly sourceOffsetX: number;
  /** CSS pixels per canonical reference-image pixel. */
  readonly backdropScale: number;
  readonly safeFrame: FlatCameraCssRectangle;
}

export interface FlatCameraPlacementInput {
  readonly profile: FlatCameraProfileId;
  readonly playerReferenceBounds: FlatCameraReferenceBounds;
  readonly footReferenceBounds: FlatCameraReferenceBounds;
  readonly playerCssSafeRectangle: FlatCameraCssRectangle;
  readonly footCssSafeRectangle: FlatCameraCssRectangle;
  readonly protectedRectangles?: readonly FlatCameraProtectedRectangle[];
  readonly trackingReferenceX?: number;
}

/**
 * Pure fixed-backdrop camera contract. All source-space values address the
 * canonical 1817 x 866 reference image; safe-frame values are CSS pixels.
 */
export interface FlatCameraPlacement {
  readonly profile: FlatCameraProfile;
  readonly safeFrame: FlatCameraCssRectangle;
  readonly backdropScale: number;
  readonly sourceWindow: {
    readonly width: number;
    readonly height: number;
  };
  readonly sourceOffset: {
    readonly x: number;
    readonly y: 0;
  };
  readonly playerReferenceBounds: FlatCameraReferenceBounds;
  readonly footReferenceBounds: FlatCameraReferenceBounds;
  readonly playerProjectedBounds: FlatCameraProjectedBounds;
  readonly footProjectedBounds: FlatCameraProjectedBounds;
  readonly playerCssSafeRectangle: FlatCameraCssRectangle;
  readonly footCssSafeRectangle: FlatCameraCssRectangle;
  readonly selectedProtectedIds: readonly string[];
  readonly selectedProtectedRectangles: readonly FlatCameraProtectedRectangle[];
  readonly sourceClamp: FlatCameraFeasibleInterval;
  readonly feasibleInterval: FlatCameraFeasibleInterval;
}

export const FLAT_CAMERA_REFERENCE_IMAGE = {
  width: 1817,
  height: 866
} as const;

export const FLAT_CAMERA_MAX_STEP_CSS_PX = 24;
const FLAT_CAMERA_PROJECTION_EPSILON = 1e-6;

export const FLAT_CAMERA_PROFILES = {
  desktop: {
    id: "desktop",
    viewportWidth: 1440,
    viewportHeight: 900,
    safeFrame: { x: 0, y: 0, width: 1440, height: 900 }
  },
  mobile: {
    id: "mobile",
    viewportWidth: 390,
    viewportHeight: 844,
    safeFrame: { x: 0, y: 64, width: 390, height: 420 }
  }
} as const satisfies Readonly<Record<FlatCameraProfileId, FlatCameraProfile>>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isFiniteBounds(bounds: FlatCameraReferenceBounds) {
  return [
    bounds.minimumX,
    bounds.maximumX,
    bounds.minimumY,
    bounds.maximumY
  ].every(Number.isFinite) &&
    bounds.minimumX <= bounds.maximumX &&
    bounds.minimumY <= bounds.maximumY;
}

function isFiniteCssRectangle(rectangle: FlatCameraCssRectangle) {
  return [
    rectangle.x,
    rectangle.y,
    rectangle.width,
    rectangle.height
  ].every(Number.isFinite) &&
    rectangle.x >= 0 &&
    rectangle.y >= 0 &&
    rectangle.width > 0 &&
    rectangle.height > 0;
}

function cssRectangleContains(
  container: FlatCameraCssRectangle,
  contained: FlatCameraCssRectangle
) {
  return contained.x >= container.x - FLAT_CAMERA_PROJECTION_EPSILON &&
    contained.y >= container.y - FLAT_CAMERA_PROJECTION_EPSILON &&
    contained.x + contained.width <=
      container.x + container.width + FLAT_CAMERA_PROJECTION_EPSILON &&
    contained.y + contained.height <=
      container.y + container.height + FLAT_CAMERA_PROJECTION_EPSILON;
}

function boundsInsideReferenceImage(bounds: FlatCameraReferenceBounds) {
  return isFiniteBounds(bounds) &&
    bounds.minimumX >= 0 &&
    bounds.maximumX <= FLAT_CAMERA_REFERENCE_IMAGE.width &&
    bounds.minimumY >= 0 &&
    bounds.maximumY <= FLAT_CAMERA_REFERENCE_IMAGE.height;
}

function isValidReferenceProjectionInput({
  sourceOffsetX,
  backdropScale,
  safeFrame
}: FlatCameraReferenceProjectionInput) {
  if (
    ![
      sourceOffsetX,
      backdropScale,
      safeFrame.x,
      safeFrame.y,
      safeFrame.width,
      safeFrame.height
    ].every(Number.isFinite) ||
    sourceOffsetX < 0 ||
    backdropScale <= 0 ||
    safeFrame.x < 0 ||
    safeFrame.y < 0 ||
    safeFrame.width <= 0 ||
    safeFrame.height <= 0 ||
    Math.abs(
      safeFrame.height -
        FLAT_CAMERA_REFERENCE_IMAGE.height * backdropScale
    ) > FLAT_CAMERA_PROJECTION_EPSILON
  ) {
    return false;
  }

  const sourceWindowMaximumX =
    sourceOffsetX + safeFrame.width / backdropScale;
  return (
    sourceWindowMaximumX <=
    FLAT_CAMERA_REFERENCE_IMAGE.width + FLAT_CAMERA_PROJECTION_EPSILON
  );
}

/**
 * Rebases one canonical reference-image pixel through the live horizontal crop
 * into viewport CSS pixels. The caller may supply a temporally stepped crop;
 * invalid image, scale, or safe-frame input fails closed.
 */
export function projectFlatCameraReferencePoint(
  pixel: readonly [x: number, y: number],
  projection: FlatCameraReferenceProjectionInput
): readonly [x: number, y: number] | null {
  const [referenceX, referenceY] = pixel;
  if (
    ![referenceX, referenceY].every(Number.isFinite) ||
    referenceX < -FLAT_CAMERA_PROJECTION_EPSILON ||
    referenceX >
      FLAT_CAMERA_REFERENCE_IMAGE.width + FLAT_CAMERA_PROJECTION_EPSILON ||
    referenceY < -FLAT_CAMERA_PROJECTION_EPSILON ||
    referenceY >
      FLAT_CAMERA_REFERENCE_IMAGE.height + FLAT_CAMERA_PROJECTION_EPSILON ||
    !isValidReferenceProjectionInput(projection)
  ) {
    return null;
  }

  const boundedReferenceX = clamp(
    referenceX,
    0,
    FLAT_CAMERA_REFERENCE_IMAGE.width
  );
  const boundedReferenceY = clamp(
    referenceY,
    0,
    FLAT_CAMERA_REFERENCE_IMAGE.height
  );

  return [
    projection.safeFrame.x +
      (boundedReferenceX - projection.sourceOffsetX) *
        projection.backdropScale,
    projection.safeFrame.y +
      boundedReferenceY * projection.backdropScale
  ] as const;
}

/** Projects canonical reference-image bounds through the same live crop. */
export function projectFlatCameraReferenceBounds(
  bounds: FlatCameraReferenceBounds,
  projection: FlatCameraReferenceProjectionInput
): FlatCameraReferenceBounds | null {
  if (
    !isFiniteBounds(bounds) ||
    bounds.minimumX < -FLAT_CAMERA_PROJECTION_EPSILON ||
    bounds.maximumX >
      FLAT_CAMERA_REFERENCE_IMAGE.width + FLAT_CAMERA_PROJECTION_EPSILON ||
    bounds.minimumY < -FLAT_CAMERA_PROJECTION_EPSILON ||
    bounds.maximumY >
      FLAT_CAMERA_REFERENCE_IMAGE.height + FLAT_CAMERA_PROJECTION_EPSILON
  ) {
    return null;
  }
  const minimum = projectFlatCameraReferencePoint(
    [bounds.minimumX, bounds.minimumY],
    projection
  );
  const maximum = projectFlatCameraReferencePoint(
    [bounds.maximumX, bounds.maximumY],
    projection
  );
  if (!minimum || !maximum) return null;
  return {
    minimumX: minimum[0],
    maximumX: maximum[0],
    minimumY: minimum[1],
    maximumY: maximum[1]
  };
}

export function calculateFlatCameraPlacement({
  profile: profileId,
  playerReferenceBounds,
  footReferenceBounds,
  playerCssSafeRectangle,
  footCssSafeRectangle,
  protectedRectangles = [],
  trackingReferenceX =
    (playerReferenceBounds.minimumX + playerReferenceBounds.maximumX) / 2
}: FlatCameraPlacementInput): FlatCameraPlacement | null {
  const profile = FLAT_CAMERA_PROFILES[profileId];
  if (!profile || !Number.isFinite(trackingReferenceX)) {
    return null;
  }

  const { safeFrame } = profile;
  const backdropScale = safeFrame.height / FLAT_CAMERA_REFERENCE_IMAGE.height;
  const sourceWindow = {
    width: safeFrame.width / backdropScale,
    height: safeFrame.height / backdropScale
  };
  if (
    !boundsInsideReferenceImage(playerReferenceBounds) ||
    !boundsInsideReferenceImage(footReferenceBounds) ||
    !isFiniteCssRectangle(playerCssSafeRectangle) ||
    !isFiniteCssRectangle(footCssSafeRectangle) ||
    !cssRectangleContains(safeFrame, playerCssSafeRectangle) ||
    !cssRectangleContains(safeFrame, footCssSafeRectangle) ||
    protectedRectangles.some(
      (rectangle) =>
        !isFiniteBounds(rectangle) ||
        rectangle.minimumX < 0 ||
        rectangle.maximumX > FLAT_CAMERA_REFERENCE_IMAGE.width ||
        rectangle.minimumY < 0 ||
        rectangle.maximumY > FLAT_CAMERA_REFERENCE_IMAGE.height
    )
  ) {
    return null;
  }

  const sourceOffsetIntervalForBounds = (
    bounds: FlatCameraReferenceBounds,
    cssSafeRectangle: FlatCameraCssRectangle
  ): FlatCameraFeasibleInterval => ({
    minimumX:
      bounds.maximumX -
      (cssSafeRectangle.x +
        cssSafeRectangle.width -
        safeFrame.x) /
        backdropScale,
    maximumX:
      bounds.minimumX -
      (cssSafeRectangle.x - safeFrame.x) / backdropScale
  });
  const playerInterval = sourceOffsetIntervalForBounds(
    playerReferenceBounds,
    playerCssSafeRectangle
  );
  const footInterval = sourceOffsetIntervalForBounds(
    footReferenceBounds,
    footCssSafeRectangle
  );
  const sourceClamp = {
    minimumX: 0,
    maximumX: FLAT_CAMERA_REFERENCE_IMAGE.width - sourceWindow.width
  };
  const feasibleInterval = {
    minimumX: Math.max(
      0,
      playerInterval.minimumX,
      footInterval.minimumX,
      ...protectedRectangles.map(
        (rectangle) => rectangle.maximumX - sourceWindow.width
      )
    ),
    maximumX: Math.min(
      sourceClamp.maximumX,
      playerInterval.maximumX,
      footInterval.maximumX,
      ...protectedRectangles.map((rectangle) => rectangle.minimumX)
    )
  };
  if (
    ![feasibleInterval.minimumX, feasibleInterval.maximumX].every(Number.isFinite) ||
    feasibleInterval.minimumX > feasibleInterval.maximumX
  ) {
    return null;
  }

  const sourceOffsetX = clamp(
    trackingReferenceX - sourceWindow.width / 2,
    feasibleInterval.minimumX,
    feasibleInterval.maximumX
  );
  const projection = {
    sourceOffsetX,
    backdropScale,
    safeFrame
  };
  const playerSafeFrameBounds = projectFlatCameraReferenceBounds(
    playerReferenceBounds,
    projection
  );
  const footSafeFrameBounds = projectFlatCameraReferenceBounds(
    footReferenceBounds,
    projection
  );
  if (!playerSafeFrameBounds || !footSafeFrameBounds) return null;
  const projectedBoundsInside = (
    bounds: FlatCameraReferenceBounds,
    cssSafeRectangle: FlatCameraCssRectangle
  ) =>
    bounds.minimumX >=
      cssSafeRectangle.x - FLAT_CAMERA_PROJECTION_EPSILON &&
    bounds.maximumX <=
      cssSafeRectangle.x +
        cssSafeRectangle.width +
        FLAT_CAMERA_PROJECTION_EPSILON &&
    bounds.minimumY >=
      cssSafeRectangle.y - FLAT_CAMERA_PROJECTION_EPSILON &&
    bounds.maximumY <=
      cssSafeRectangle.y +
        cssSafeRectangle.height +
        FLAT_CAMERA_PROJECTION_EPSILON;
  if (
    !projectedBoundsInside(playerSafeFrameBounds, playerCssSafeRectangle) ||
    !projectedBoundsInside(footSafeFrameBounds, footCssSafeRectangle)
  ) {
    return null;
  }
  const projectedPlayer = {
    reference: playerReferenceBounds,
    safeFrame: playerSafeFrameBounds
  };
  const projectedFoot = {
    reference: footReferenceBounds,
    safeFrame: footSafeFrameBounds
  };

  return {
    profile,
    safeFrame,
    backdropScale,
    sourceWindow,
    sourceOffset: { x: sourceOffsetX, y: 0 },
    playerReferenceBounds,
    footReferenceBounds,
    playerProjectedBounds: projectedPlayer,
    footProjectedBounds: projectedFoot,
    playerCssSafeRectangle,
    footCssSafeRectangle,
    selectedProtectedIds: protectedRectangles.map(({ sourceId }) => sourceId),
    selectedProtectedRectangles: protectedRectangles,
    sourceClamp,
    feasibleInterval
  };
}
