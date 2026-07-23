import {
  selectPlayerRuntimeFrame,
  type PlayerRuntimeFrameDescriptor,
  type PlayerRuntimeManifest,
  type PlayerSpriteDirection
} from "./CharacterAssets";

export interface FlatPlayerMotionState {
  facingScale: number;
  runTime: number;
}

export interface FlatPlayerMotionInput {
  deltaSeconds: number;
  moving: boolean;
  horizontalIntent: number;
  jumpHeight: number;
  direction?: PlayerSpriteDirection;
  runtimeManifest?: PlayerRuntimeManifest;
  sideFacing?: -1 | 1;
}

export interface FlatPlayerPose {
  facingScale: number;
  strideFrame: 0 | 1;
  widthScale: number;
  heightScale: number;
  rotation: number;
  dustOpacity: number;
  shadowOpacity: number;
  shadowScale: number;
  spriteOffsetY: number;
  spriteScaleX: number;
  selectedFrame: PlayerRuntimeFrameDescriptor | null;
  footAnchorOffset: number | null;
}

const TURN_SPEED = 8;
const RUN_SPEED = 12;
const STRIDE_PHASE_RADIANS = Math.PI / 2;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function moveTowards(current: number, target: number, distance: number) {
  if (Math.abs(target - current) <= distance) {
    return target;
  }
  return current + Math.sign(target - current) * distance;
}

export function getPlayerDirectionalWidthScale(
  direction: PlayerSpriteDirection,
  widthScale: number
) {
  return direction === "side" ? widthScale : Math.abs(widthScale);
}

export function createFlatPlayerMotionState(): FlatPlayerMotionState {
  return {
    facingScale: 1,
    runTime: 0
  };
}

export function advanceFlatPlayerMotion(
  state: FlatPlayerMotionState,
  {
    deltaSeconds,
    moving,
    horizontalIntent,
    jumpHeight,
    direction,
    runtimeManifest,
    sideFacing
  }: FlatPlayerMotionInput
): FlatPlayerPose {
  if (moving) {
    state.runTime += Math.max(0, deltaSeconds) * RUN_SPEED;
  }

  const targetFacing =
    horizontalIntent < -0.05
      ? -1
      : horizontalIntent > 0.05
        ? 1
        : state.facingScale < 0
          ? -1
          : 1;
  state.facingScale = moveTowards(
    state.facingScale,
    targetFacing,
    Math.max(0, deltaSeconds) * TURN_SPEED
  );

  const step = moving ? Math.sin(state.runTime) : 0;
  const compression = moving ? Math.abs(step) * 0.045 : 0;
  const grounded = jumpHeight <= 0.02;
  const jumpProgress = clamp(jumpHeight / 2, 0, 1);
  const strideFrame = moving
    ? ((Math.floor(state.runTime / STRIDE_PHASE_RADIANS) % 2) as 0 | 1)
    : 0;
  const selectedFrame =
    runtimeManifest && direction
      ? selectPlayerRuntimeFrame(runtimeManifest, direction, moving, strideFrame)
      : null;
  const spriteScaleX =
    direction === "side"
      ? sideFacing ?? (state.facingScale < 0 ? -1 : 1)
      : 1;

  return {
    facingScale: state.facingScale,
    strideFrame,
    widthScale: state.facingScale * (1 + compression * 0.6),
    heightScale: 1 - compression,
    rotation: moving ? step * 0.028 - horizontalIntent * 0.035 : 0,
    dustOpacity:
      moving && grounded ? 0.34 + Math.abs(Math.cos(state.runTime)) * 0.24 : 0,
    shadowOpacity: 0.56 * (1 - jumpProgress * 0.68),
    shadowScale: 1 - jumpProgress * 0.22,
    spriteOffsetY: Math.max(0, jumpHeight),
    spriteScaleX,
    selectedFrame,
    footAnchorOffset: selectedFrame?.footOffset ?? null
  };
}
