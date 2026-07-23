import type { CameraSnapshot } from "./CameraRig";
import {
  calculateFlatCameraPlacement,
  type FlatCameraCssRectangle,
  type FlatCameraPlacement,
  type FlatCameraProfileId,
  type FlatCameraProtectedRectangle,
  type FlatCameraReferenceBounds
} from "./FlatCameraPlacement";
import {
  getNavigationRegionAt,
  isWalkable,
  projectWorldToReference,
  type NavigationRegion
} from "./RpgWorldGeometry";
import {
  RPG_REFERENCE_ZONE_ANCHORS,
  RPG_TRANSITION_PROTECTED_PAIRS,
  RPG_WORLD_TRANSITIONS,
  type ReferenceProtectedRectangle,
  type WorldPoint2,
  type WorldPoint3
} from "./RpgWorldModel";

export type RpgWorldVector = readonly [number, number, number];
export type RpgCameraZoneId = keyof typeof RPG_REFERENCE_ZONE_ANCHORS;
export type RpgCameraRegionSelection = NavigationRegion;
export const RPG_CAMERA_REGION_PROGRESS_TOLERANCE = 1e-10;

export interface RpgReferenceCameraPlacementInput {
  readonly player: WorldPoint2 | WorldPoint3;
  readonly profile: FlatCameraProfileId;
  readonly region?: RpgCameraRegionSelection;
}

export interface RpgMeasuredPlayerProjection {
  readonly pixel: readonly [number, number];
  readonly uv: readonly [number, number];
  readonly spriteScale: number;
  readonly depthKey: number;
  readonly triangleId: string;
}

export interface RpgPlayerViewportProjection {
  readonly profile: FlatCameraProfileId;
  readonly intrinsicSpriteScale: number;
  readonly depthKey: number;
  readonly intrinsicReferenceHeight: number;
  readonly displayReferenceHeight: number;
  readonly displayCssHeight: number;
}

export const RPG_PLAYER_INTRINSIC_BASE_REFERENCE_HEIGHT = 180;
export const RPG_PLAYER_CANONICAL_MIN_SPRITE_SCALE = 0.64;
export const RPG_PLAYER_CANONICAL_MAX_SPRITE_SCALE = 1.22;
export const RPG_PLAYER_SPRITE_ASPECT_RATIO = 2 / 3;
export const RPG_PLAYER_MINIMUM_FOOT_OFFSET = 134 / 1536;
export const RPG_PLAYER_MAXIMUM_FOOT_OFFSET = 306 / 1536;
export const RPG_PLAYER_PROFILE_SAFE_RECTANGLES = {
  desktop: {
    player: { x: 96, y: 48, width: 1248, height: 804 },
    foot: { x: 120, y: 120, width: 1200, height: 720 }
  },
  mobile: {
    player: { x: 0, y: 64, width: 390, height: 420 },
    foot: { x: 32, y: 104, width: 326, height: 284 }
  }
} as const satisfies Readonly<
  Record<
    FlatCameraProfileId,
    {
      readonly player: FlatCameraCssRectangle;
      readonly foot: FlatCameraCssRectangle;
    }
  >
>;
const RPG_PLAYER_DESKTOP_CSS_SCALE = 900 / 866;
const RPG_PLAYER_MOBILE_CSS_SCALE = 420 / 866;
const RPG_PLAYER_MOBILE_MIN_CSS_HEIGHT = 72;
const RPG_PLAYER_MOBILE_HEIGHT_RANGE = 40;
const RPG_PLAYER_CANONICAL_SCALE_RANGE = 0.58;
// Barycentric interpolation can represent the exact 0.64 endpoint one ULP low.
// Accept only that representational endpoint; no general range tolerance or
// clamping is applied to the intrinsic scale.
const RPG_PLAYER_MIN_INTERPOLATION_ULP = Number.EPSILON / 2;

export function resolveRpgPlayerViewportProjection(
  projection: Readonly<
    Pick<RpgMeasuredPlayerProjection, "spriteScale" | "depthKey">
  >,
  profile: FlatCameraProfileId
): RpgPlayerViewportProjection | null {
  const intrinsicSpriteScale = projection?.spriteScale;
  const depthKey = projection?.depthKey;
  if (
    !Number.isFinite(intrinsicSpriteScale) ||
    !Number.isFinite(depthKey) ||
    intrinsicSpriteScale <
      RPG_PLAYER_CANONICAL_MIN_SPRITE_SCALE -
        RPG_PLAYER_MIN_INTERPOLATION_ULP ||
    intrinsicSpriteScale > RPG_PLAYER_CANONICAL_MAX_SPRITE_SCALE
  ) {
    return null;
  }

  const intrinsicReferenceHeight =
    RPG_PLAYER_INTRINSIC_BASE_REFERENCE_HEIGHT * intrinsicSpriteScale;
  let displayReferenceHeight: number;
  let displayCssHeight: number;
  if (profile === "desktop") {
    displayReferenceHeight = intrinsicReferenceHeight;
    displayCssHeight = displayReferenceHeight * RPG_PLAYER_DESKTOP_CSS_SCALE;
  } else if (profile === "mobile") {
    displayCssHeight =
      RPG_PLAYER_MOBILE_MIN_CSS_HEIGHT +
      (intrinsicSpriteScale - RPG_PLAYER_CANONICAL_MIN_SPRITE_SCALE) *
        (RPG_PLAYER_MOBILE_HEIGHT_RANGE /
          RPG_PLAYER_CANONICAL_SCALE_RANGE);
    displayReferenceHeight =
      displayCssHeight / RPG_PLAYER_MOBILE_CSS_SCALE;
  } else {
    return null;
  }

  if (
    ![
      intrinsicReferenceHeight,
      displayReferenceHeight,
      displayCssHeight
    ].every(Number.isFinite)
  ) {
    return null;
  }
  return {
    profile,
    intrinsicSpriteScale,
    depthKey,
    intrinsicReferenceHeight,
    displayReferenceHeight,
    displayCssHeight
  };
}

export interface RpgPlayerCameraReferenceBounds {
  readonly playerReferenceBounds: FlatCameraReferenceBounds;
  readonly footReferenceBounds: FlatCameraReferenceBounds;
}

export function resolveRpgPlayerCameraReferenceBounds(
  projection: Readonly<Pick<RpgMeasuredPlayerProjection, "pixel">>,
  viewportProjection: Readonly<
    Pick<RpgPlayerViewportProjection, "displayReferenceHeight">
  >
): RpgPlayerCameraReferenceBounds | null {
  const [pixelX, pixelY] = projection.pixel;
  const height = viewportProjection.displayReferenceHeight;
  if (![pixelX, pixelY, height].every(Number.isFinite) || height <= 0) {
    return null;
  }
  return {
    playerReferenceBounds: {
      minimumX: pixelX - (height * RPG_PLAYER_SPRITE_ASPECT_RATIO) / 2,
      maximumX: pixelX + (height * RPG_PLAYER_SPRITE_ASPECT_RATIO) / 2,
      minimumY:
        pixelY - height * (1 - RPG_PLAYER_MINIMUM_FOOT_OFFSET),
      maximumY: pixelY + height * RPG_PLAYER_MAXIMUM_FOOT_OFFSET
    },
    footReferenceBounds: {
      minimumX: pixelX,
      maximumX: pixelX,
      minimumY: pixelY,
      maximumY: pixelY
    }
  };
}

/**
 * Domain-aware fixed-backdrop placement. The measured player projection and
 * selected navigation region are included beside the generic crop contract so
 * the renderer never has to rediscover protected landmarks.
 */
export interface RpgReferenceCameraPlacement extends FlatCameraPlacement {
  readonly playerWorldXZ: WorldPoint2;
  readonly playerReferenceProjection: RpgMeasuredPlayerProjection;
  readonly playerViewportProjection: RpgPlayerViewportProjection;
  readonly region: RpgCameraRegionSelection;
  readonly trackingReferenceX: number;
}

const transitionById = new Map<
  string,
  (typeof RPG_WORLD_TRANSITIONS)[number]
>(
  RPG_WORLD_TRANSITIONS.map((transition) => [transition.id, transition])
);
const protectedPairByTransitionId = new Map<
  string,
  (typeof RPG_TRANSITION_PROTECTED_PAIRS)[number]
>(
  RPG_TRANSITION_PROTECTED_PAIRS.map((pair) => [pair.transitionId, pair])
);

function toWorldXZ(player: WorldPoint2 | WorldPoint3): WorldPoint2 {
  return player.length === 2
    ? player
    : [player[0], player[2]];
}

function toProtectedRectangle(
  rectangle: ReferenceProtectedRectangle
): FlatCameraProtectedRectangle {
  return {
    id: rectangle.id,
    sourceId: rectangle.sourceId,
    minimumX: rectangle.minimumX,
    maximumX: rectangle.maximumX,
    minimumY: rectangle.minimumY,
    maximumY: rectangle.maximumY
  };
}

function rectangleCenterX(rectangle: ReferenceProtectedRectangle) {
  return (rectangle.minimumX + rectangle.maximumX) / 2;
}

export function smoothstepRpgCameraProgress(progress: number) {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    return null;
  }
  return progress * progress * (3 - 2 * progress);
}

function resolveRegion(
  playerWorldXZ: WorldPoint2,
  explicitRegion?: RpgCameraRegionSelection
): RpgCameraRegionSelection | null {
  const navigation = getNavigationRegionAt(playerWorldXZ);
  if (!navigation) return null;
  if (explicitRegion && !navigationRegionsMatch(navigation, explicitRegion)) {
    return null;
  }
  return navigation;
}

function navigationRegionsMatch(
  canonical: NavigationRegion,
  supplied: RpgCameraRegionSelection
) {
  if (
    canonical.kind !== supplied.kind ||
    canonical.regionId !== supplied.regionId ||
    canonical.displayZoneId !== supplied.displayZoneId ||
    canonical.highlightedZoneIds.length !== supplied.highlightedZoneIds.length ||
    canonical.highlightedZoneIds.some(
      (zoneId, index) => zoneId !== supplied.highlightedZoneIds[index]
    )
  ) {
    return false;
  }
  if (canonical.kind === "zone" || supplied.kind === "zone") {
    return canonical.kind === "zone" && supplied.kind === "zone";
  }
  return canonical.transitionId === supplied.transitionId &&
    canonical.fromZoneId === supplied.fromZoneId &&
    canonical.toZoneId === supplied.toZoneId &&
    Math.abs(canonical.progress - supplied.progress) <=
      RPG_CAMERA_REGION_PROGRESS_TOLERANCE;
}

export function calculateRpgReferenceCameraPlacement({
  player,
  profile,
  region: explicitRegion
}: RpgReferenceCameraPlacementInput): RpgReferenceCameraPlacement | null {
  const playerWorldXZ = toWorldXZ(player);
  if (!playerWorldXZ.every(Number.isFinite) || !isWalkable(playerWorldXZ)) {
    return null;
  }

  const playerReferenceProjection = projectWorldToReference(playerWorldXZ);
  if (!playerReferenceProjection) return null;
  const playerViewportProjection = resolveRpgPlayerViewportProjection(
    playerReferenceProjection,
    profile
  );
  if (!playerViewportProjection) return null;
  const playerCameraBounds = resolveRpgPlayerCameraReferenceBounds(
    playerReferenceProjection,
    playerViewportProjection
  );
  const profileSafeRectangles = RPG_PLAYER_PROFILE_SAFE_RECTANGLES[profile];
  if (!playerCameraBounds || !profileSafeRectangles) return null;
  const region = resolveRegion(playerWorldXZ, explicitRegion);
  if (!region) return null;

  let protectedRectangles: readonly FlatCameraProtectedRectangle[];
  let trackingReferenceX: number;
  if (region.kind === "zone") {
    const anchor = RPG_REFERENCE_ZONE_ANCHORS[region.regionId];
    if (!anchor) return null;
    protectedRectangles = [toProtectedRectangle(anchor.cameraFocusRectangle)];
    trackingReferenceX = playerReferenceProjection.pixel[0];
  } else {
    const transition = transitionById.get(region.transitionId);
    const pair = protectedPairByTransitionId.get(region.transitionId);
    const easedProgress = smoothstepRpgCameraProgress(region.progress);
    if (!transition || !pair || easedProgress === null) return null;

    const fromRectangle = toProtectedRectangle(pair.fromRectangle);
    const toRectangle = toProtectedRectangle(pair.toRectangle);
    protectedRectangles =
      region.progress < transition.dualProtectionRange[0]
        ? [fromRectangle]
        : region.progress <= transition.dualProtectionRange[1]
          ? [fromRectangle, toRectangle]
          : [toRectangle];
    trackingReferenceX =
      rectangleCenterX(pair.fromRectangle) +
      (rectangleCenterX(pair.toRectangle) -
        rectangleCenterX(pair.fromRectangle)) * easedProgress;
  }

  const placement = calculateFlatCameraPlacement({
    profile,
    ...playerCameraBounds,
    playerCssSafeRectangle: profileSafeRectangles.player,
    footCssSafeRectangle: profileSafeRectangles.foot,
    protectedRectangles,
    trackingReferenceX
  });
  return placement
    ? {
        ...placement,
        playerWorldXZ,
        playerReferenceProjection,
        playerViewportProjection,
        region,
        trackingReferenceX
      }
    : null;
}

// Compatibility exports for the existing Three.js canvas. They deliberately
// ignore drag yaw and pitch; Lane 6 can remove them with the perspective view.
export interface RpgCameraPlacementInput {
  player: RpgWorldVector;
  heading: RpgWorldVector;
  camera: Readonly<CameraSnapshot>;
}

export interface RpgCameraPlacement {
  position: LegacyCameraVector3;
  target: LegacyCameraVector3;
  fov: number;
}

export interface RpgCameraPlacementBuffer {
  placement: RpgCameraPlacement;
  forward: LegacyCameraVector3;
}

export interface RpgCameraFollowState {
  orbitYawDegrees: number;
  rigYawDegrees: number;
  recentering: boolean;
}

export interface RpgCameraHeadingState {
  yawDegrees: number;
}

export interface RpgCameraHeadingInput {
  heading: RpgWorldVector;
  deltaSeconds: number;
  orbitYawDegrees?: number;
}

export interface RpgCameraFollowInput {
  rigYawDegrees: number;
  moving: boolean;
  dragging: boolean;
  deltaSeconds: number;
  recenter?: boolean;
  heading?: RpgCameraHeadingState;
}

const LEGACY_FIXED_FOV = 52;
const LEGACY_FIXED_HEIGHT = 8;
const LEGACY_FIXED_DEPTH = 0.001;
const CAMERA_RESPONSE_PER_SECOND = 9;

class LegacyCameraVector3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0
  ) {}

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  add(vector: Readonly<LegacyCameraVector3>) {
    this.x += vector.x;
    this.y += vector.y;
    this.z += vector.z;
    return this;
  }

  lerp(vector: Readonly<LegacyCameraVector3>, alpha: number) {
    this.x += (vector.x - this.x) * alpha;
    this.y += (vector.y - this.y) * alpha;
    this.z += (vector.z - this.z) * alpha;
    return this;
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }
}

function normalizeDegrees(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function calculateRpgCameraCompositeYaw(
  headingYawDegrees: number,
  orbitYawDegrees: number
) {
  void orbitYawDegrees;
  return Number.isFinite(headingYawDegrees)
    ? normalizeDegrees(headingYawDegrees)
    : 0;
}

export function calculateRpgCameraDirectionYaw(direction: RpgWorldVector) {
  const directionX = Number.isFinite(direction[0]) ? direction[0] : 0;
  const directionZ = Number.isFinite(direction[2]) ? direction[2] : -1;
  if (Math.hypot(directionX, directionZ) < 1e-8) return -180;
  return normalizeDegrees(
    (Math.atan2(directionX, directionZ) * 180) / Math.PI
  );
}

export const RPG_CAMERA_JUMP_FOLLOW = 0.35;

export function calculateRpgCameraFootingHeight(
  groundHeight: number,
  jumpHeight: number
) {
  const ground = Number.isFinite(groundHeight) ? groundHeight : 0;
  const jump = Number.isFinite(jumpHeight) ? Math.max(0, jumpHeight) : 0;
  return ground + jump * RPG_CAMERA_JUMP_FOLLOW;
}

export function calculateRpgCameraDamping(deltaSeconds: number) {
  const safeDeltaSeconds = Number.isFinite(deltaSeconds)
    ? Math.max(0, deltaSeconds)
    : 0;
  return 1 - Math.exp(-CAMERA_RESPONSE_PER_SECOND * safeDeltaSeconds);
}

export function advanceRpgCameraPoseInto(
  cameraPosition: LegacyCameraVector3,
  cameraTarget: LegacyCameraVector3,
  desired: RpgCameraPlacement,
  deltaSeconds: number
) {
  const damping = calculateRpgCameraDamping(deltaSeconds);
  cameraPosition.lerp(desired.position, damping);
  cameraTarget.lerp(desired.target, damping);
  return damping;
}

export function translateRpgCameraWithPlayer(
  cameraPosition: LegacyCameraVector3,
  cameraTarget: LegacyCameraVector3,
  playerTranslation: Readonly<LegacyCameraVector3>
) {
  cameraPosition.add(playerTranslation);
  cameraTarget.add(playerTranslation);
}

export function createRpgCameraFollowState(
  initialRigYawDegrees = 0
): RpgCameraFollowState {
  void initialRigYawDegrees;
  return { orbitYawDegrees: 0, rigYawDegrees: 0, recentering: false };
}

export function createRpgCameraHeadingState(
  initialHeading: RpgWorldVector
): RpgCameraHeadingState {
  return { yawDegrees: calculateRpgCameraDirectionYaw(initialHeading) };
}

export function advanceRpgCameraHeadingInto(
  state: RpgCameraHeadingState,
  { heading }: RpgCameraHeadingInput,
  target: [number, number, number]
) {
  state.yawDegrees = calculateRpgCameraDirectionYaw(heading);
  const yawRadians = (state.yawDegrees * Math.PI) / 180;
  target[0] = Math.sin(yawRadians);
  target[1] = 0;
  target[2] = Math.cos(yawRadians);
  return target;
}

export function advanceRpgCameraFollowYaw(
  state: RpgCameraFollowState,
  input?: RpgCameraFollowInput
) {
  void input;
  state.orbitYawDegrees = 0;
  state.rigYawDegrees = 0;
  state.recentering = false;
  return 0;
}

export function createRpgCameraPlacementBuffer(): RpgCameraPlacementBuffer {
  return {
    placement: {
      position: new LegacyCameraVector3(),
      target: new LegacyCameraVector3(),
      fov: LEGACY_FIXED_FOV
    },
    forward: new LegacyCameraVector3(0, 0, -1)
  };
}

export function calculateRpgCameraPlacementInto(
  { player }: RpgCameraPlacementInput,
  buffer: RpgCameraPlacementBuffer
): RpgCameraPlacement {
  buffer.placement.position.set(
    player[0],
    player[1] + LEGACY_FIXED_HEIGHT,
    player[2] + LEGACY_FIXED_DEPTH
  );
  buffer.placement.target.set(player[0], player[1], player[2]);
  buffer.placement.fov = LEGACY_FIXED_FOV;
  buffer.forward.set(0, -1, 0);
  return buffer.placement;
}

export function calculateRpgCameraPlacement(
  input: RpgCameraPlacementInput
): RpgCameraPlacement {
  return calculateRpgCameraPlacementInto(
    input,
    createRpgCameraPlacementBuffer()
  );
}
