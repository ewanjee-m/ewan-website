"use client";

import {
  getSelectedPlayerRuntimeManifest,
  type PlayerCharacterId,
  type PlayerRuntimeFrameDescriptor,
  type PlayerRuntimeManifest
} from "./CharacterAssets";
import {
  advanceFlatPlayerMotion,
  createFlatPlayerMotionState,
  type FlatPlayerPose
} from "./FlatPlayerMotion";
import {
  createPanoramaPlayerDirectionState,
  updatePanoramaPlayerDirection
} from "./PanoramaPlayerDirection";
import { resolveRpgWorldDepthBands } from "./RpgWorldDepthBands";
import type { WorldPoint3 } from "./RpgWorldModel";
import type { MovementIntent } from "./WorldSession";

export const RPG_PLAYER_SPRITE_REFERENCE_HEIGHT = 2.1;
export const RPG_PLAYER_SPRITE_ALPHA_TEST = 0.1;

export interface RpgPlayerSpriteFrameInput {
  readonly deltaSeconds: number;
  readonly position: WorldPoint3;
  readonly heading: WorldPoint3;
  readonly rawMovement: Readonly<MovementIntent>;
  readonly moving: boolean;
  readonly jumpHeight: number;
}

export interface RpgPlayerSpriteRenderState {
  readonly frame: PlayerRuntimeFrameDescriptor;
  readonly direction: PlayerRuntimeFrameDescriptor["direction"];
  readonly flip: -1 | 1;
  readonly locomotion: "idle" | "run" | "jump";
  readonly planeHeight: number;
  readonly planeWidth: number;
  readonly planeCenterY: number;
  readonly footY: number;
  readonly shadowY: number;
  readonly playerRenderOrder: number;
  readonly foregroundRenderOrder: number;
  readonly activeBand: NonNullable<
    ReturnType<typeof resolveRpgWorldDepthBands>
  >["activeBand"];
  readonly crossing: NonNullable<
    ReturnType<typeof resolveRpgWorldDepthBands>
  >["crossing"];
  readonly worldX: number;
  readonly worldZ: number;
  readonly heading: WorldPoint3;
  readonly projection: NonNullable<
    ReturnType<typeof resolveRpgWorldDepthBands>
  >["projection"];
  readonly pose: FlatPlayerPose;
}

export interface RpgPlayerSpriteController {
  readonly character: PlayerCharacterId;
  readonly manifest: PlayerRuntimeManifest;
  readonly images: ReadonlyMap<string, HTMLImageElement>;
  applyFrame(input: RpgPlayerSpriteFrameInput): RpgPlayerSpriteRenderState | null;
}

export interface RpgPlayerCanvasPlacement {
  readonly footX: number;
  readonly footY: number;
  readonly displayHeight: number;
}

interface ImageFactory {
  (asset: string): HTMLImageElement;
}

function defaultImageFactory(asset: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = asset;
  return image;
}

async function decodeImage(image: HTMLImageElement) {
  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }
  if (image.complete && image.naturalWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error("image-decode-failed")), {
      once: true
    });
  });
}

export async function loadRpgPlayerSpriteImages(
  manifest: PlayerRuntimeManifest,
  imageFactory: ImageFactory = defaultImageFactory
) {
  const entries = await Promise.all(
    manifest.frames.map(async ({ asset }) => {
      const image = imageFactory(asset);
      if (image.getAttribute("src") !== asset && image.src !== asset) {
        image.src = asset;
      }
      await decodeImage(image);
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        throw new Error(`invalid-player-image:${asset}`);
      }
      return [asset, image] as const;
    })
  );
  return new Map(entries);
}

export function createRpgPlayerSpriteController(
  character: PlayerCharacterId,
  images: ReadonlyMap<string, HTMLImageElement>
): RpgPlayerSpriteController {
  const manifest = getSelectedPlayerRuntimeManifest(character);
  const directionState = createPanoramaPlayerDirectionState();
  const motionState = createFlatPlayerMotionState();
  return {
    character,
    manifest,
    images,
    applyFrame(input) {
      return createRpgPlayerSpriteRenderState(
        manifest,
        directionState,
        motionState,
        input
      );
    }
  };
}

export function createRpgPlayerSpriteRenderState(
  manifest: PlayerRuntimeManifest,
  directionState: ReturnType<typeof createPanoramaPlayerDirectionState>,
  motionState: ReturnType<typeof createFlatPlayerMotionState>,
  input: RpgPlayerSpriteFrameInput
): RpgPlayerSpriteRenderState | null {
  const depth = resolveRpgWorldDepthBands(input.position);
  if (!depth) return null;
  const direction = updatePanoramaPlayerDirection(
    directionState,
    input.rawMovement,
    input.moving
  );
  const pose = advanceFlatPlayerMotion(motionState, {
    deltaSeconds: input.deltaSeconds,
    moving: input.moving,
    horizontalIntent: input.rawMovement.x,
    jumpHeight: input.jumpHeight,
    direction: direction.direction,
    runtimeManifest: manifest,
    sideFacing: direction.sideFacing
  });
  const frame = pose.selectedFrame;
  const footOffset = pose.footAnchorOffset;
  if (!frame || footOffset === null) return null;
  const planeHeight =
    RPG_PLAYER_SPRITE_REFERENCE_HEIGHT * depth.projection.spriteScale;
  const flip = pose.spriteScaleX < 0 ? -1 : 1;
  const footY = pose.spriteOffsetY;
  return {
    frame,
    direction: direction.direction,
    flip,
    locomotion:
      input.jumpHeight > 0.02 ? "jump" : input.moving ? "run" : "idle",
    planeHeight,
    planeWidth: planeHeight * frame.aspectRatio,
    planeCenterY: footY + planeHeight * (0.5 - footOffset),
    footY,
    shadowY: 0,
    playerRenderOrder: depth.playerRenderOrder,
    foregroundRenderOrder: depth.foregroundRenderOrder,
    activeBand: depth.activeBand,
    crossing: depth.crossing,
    worldX: input.position[0],
    worldZ: input.position[2],
    heading: input.heading,
    projection: depth.projection,
    pose
  };
}

export function drawRpgPlayerSprite(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  state: RpgPlayerSpriteRenderState,
  placement: RpgPlayerCanvasPlacement
) {
  const width = placement.displayHeight * state.frame.aspectRatio;
  const bottom = placement.footY +
    placement.displayHeight * state.frame.footOffset -
    state.footY * (placement.displayHeight / state.planeHeight);
  const left = placement.footX - width / 2;
  const top = bottom - placement.displayHeight;
  context.save();
  context.imageSmoothingEnabled = true;
  if (state.flip === -1) {
    context.translate(placement.footX * 2, 0);
    context.scale(-1, 1);
  }
  context.drawImage(image, left, top, width, placement.displayHeight);
  context.restore();
  return Object.freeze({
    left,
    top,
    width,
    height: placement.displayHeight,
    footX: placement.footX,
    footY: placement.footY
  });
}

export function writeRpgPlayerSpriteTelemetry(
  canvas: HTMLCanvasElement | null | undefined,
  character: PlayerCharacterId,
  state: RpgPlayerSpriteRenderState | null,
  ready: boolean
) {
  if (!canvas) return;
  canvas.dataset.characterReady = String(ready);
  canvas.dataset.characterId = character;
  canvas.dataset.playerRenderer = "canvas2d";
  if (!state) {
    canvas.dataset.characterProjection = "unregistered";
    return;
  }
  canvas.dataset.characterAsset = state.frame.asset;
  canvas.dataset.characterDirection = state.direction;
  canvas.dataset.characterFlip = String(state.flip);
  canvas.dataset.characterFrame = String(state.frame.frame);
  canvas.dataset.locomotionState = state.locomotion;
  canvas.dataset.characterHeading = state.heading
    .map((value) => value.toFixed(4))
    .join(",");
  canvas.dataset.playerFoot = `${state.worldX.toFixed(4)},${state.footY.toFixed(4)},${state.worldZ.toFixed(4)}`;
  canvas.dataset.playerShadow = `${state.worldX.toFixed(4)},${state.shadowY.toFixed(4)},${state.worldZ.toFixed(4)},${state.pose.shadowScale.toFixed(4)},${state.pose.shadowOpacity.toFixed(4)}`;
  canvas.dataset.referencePixel = state.projection.pixel
    .map((value) => value.toFixed(4))
    .join(",");
  canvas.dataset.referenceUv = state.projection.uv
    .map((value) => value.toFixed(6))
    .join(",");
  canvas.dataset.referenceScale = state.projection.spriteScale.toFixed(6);
  canvas.dataset.referenceDepth = state.projection.depthKey.toFixed(6);
  canvas.dataset.referenceTriangle = state.projection.triangleId;
  canvas.dataset.activeDepthBand = state.activeBand ?? "none";
  canvas.dataset.playerRenderOrder = String(state.playerRenderOrder);
  canvas.dataset.foregroundRenderOrder = String(state.foregroundRenderOrder);
  canvas.dataset.playerGrounded = String(state.footY <= 0.02);
  canvas.dataset.playerEnvelopeSubset = String(state.footY <= 0.02);
  canvas.dataset.playerEnvelopePolicy = "airborne-telemetry-only";
  canvas.dataset.characterProjection = "registered";
}
