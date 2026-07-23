import { describe, expect, it, vi } from "vitest";
import {
  getSelectedPlayerRuntimeManifest,
  selectPlayerRuntimeFrame
} from "../app/world/CharacterAssets";
import {
  advanceFlatPlayerMotion,
  createFlatPlayerMotionState
} from "../app/world/FlatPlayerMotion";
import {
  createPanoramaPlayerDirectionState,
  updatePanoramaPlayerDirection
} from "../app/world/PanoramaPlayerDirection";
import {
  createRpgPlayerSpriteController,
  createRpgPlayerSpriteRenderState,
  drawRpgPlayerSprite,
  loadRpgPlayerSpriteImages,
  writeRpgPlayerSpriteTelemetry,
  RPG_PLAYER_SPRITE_ALPHA_TEST,
  RPG_PLAYER_SPRITE_REFERENCE_HEIGHT
} from "../app/world/RpgPlayerCharacterSprite";
import {
  RPG_REFERENCE_MAX_ORDINARY_STEP_CSS_PX,
  projectReferencePointToViewport,
  resolveRpgReferenceViewportTransform,
  stepRpgReferenceViewportTransform
} from "../app/world/RpgReferenceSceneComposition";
import { projectWorldToReference } from "../app/world/RpgWorldGeometry";
import { RPG_WORLD_SPAWN } from "../app/world/RpgWorldModel";

function decodedImage(asset: string) {
  const image = document.createElement("img");
  image.setAttribute("src", asset);
  Object.defineProperties(image, {
    naturalWidth: { value: 768 },
    naturalHeight: { value: 1152 },
    complete: { value: true }
  });
  image.decode = vi.fn(async () => undefined);
  return image;
}

describe("RPG Canvas2D player sprite renderer", () => {
  it("resolves one deeply immutable desktop image-space transform", () => {
    const transform = resolveRpgReferenceViewportTransform({
      profile: "desktop",
      referenceFoot: [1035, 610],
      navigationRegion: {
        kind: "zone",
        regionId: "gyukatsu",
        displayZoneId: "gyukatsu",
        highlightedZoneIds: ["gyukatsu"]
      },
      revision: 7,
      navigationRevision: 11
    })!;
    expect(Object.isFrozen(transform)).toBe(true);
    expect(transform.scale).toBeCloseTo(900 / 866, 12);
    expect(projectReferencePointToViewport([1035, 610], transform)[1]).toBeCloseTo(
      610 * transform.scale,
      10
    );
  });

  it("limits ordinary crop movement but publishes an atomic target exactly", () => {
    const previous = resolveRpgReferenceViewportTransform({
      profile: "mobile",
      referenceFoot: [430, 600],
      navigationRegion: {
        kind: "zone",
        regionId: "airport",
        displayZoneId: "airport",
        highlightedZoneIds: ["airport"]
      },
      revision: 1,
      navigationRevision: 1
    })!;
    const next = stepRpgReferenceViewportTransform({
      profile: "mobile",
      referenceFoot: [760, 455],
      navigationRegion: {
        kind: "transition",
        regionId: "airport-to-tokyo",
        transitionId: "airport-to-tokyo",
        fromZoneId: "airport",
        toZoneId: "tokyo",
        progress: 0.5,
        displayZoneId: "tokyo",
        highlightedZoneIds: ["airport", "tokyo"]
      },
      revision: 2,
      navigationRevision: 2,
      previous
    })!;
    expect(Math.abs(next.imageFrame.x - previous.imageFrame.x)).toBeLessThanOrEqual(
      RPG_REFERENCE_MAX_ORDINARY_STEP_CSS_PX
    );
    const atomic = stepRpgReferenceViewportTransform({
      profile: "mobile",
      referenceFoot: [760, 455],
      navigationRegion: {
        kind: "zone",
        regionId: "tokyo",
        displayZoneId: "tokyo",
        highlightedZoneIds: ["tokyo"]
      },
      revision: 3,
      navigationRevision: 3,
      previous,
      atomic: true
    })!;
    expect(atomic.sourceOffsetX).toBe(610);
  });

  it.each(["male", "female"] as const)(
    "decodes only the selected %s identity's eight WebPs",
    async (character) => {
      const requested: string[] = [];
      const images = await loadRpgPlayerSpriteImages(
        getSelectedPlayerRuntimeManifest(character),
        (asset) => {
          requested.push(asset);
          return decodedImage(asset);
        }
      );
      expect(images).toHaveLength(8);
      expect(new Set(requested)).toHaveLength(8);
      expect(requested.every((asset) => asset.includes(`player-${character}`))).toBe(
        true
      );
      expect(
        requested.some((asset) =>
          asset.includes(`player-${character === "male" ? "female" : "male"}`)
        )
      ).toBe(false);
    }
  );

  it("keeps direction, run frame, and one horizontal flip in pure state", () => {
    const manifest = getSelectedPlayerRuntimeManifest("male");
    const direction = createPanoramaPlayerDirectionState();
    const motion = createFlatPlayerMotionState();
    const input = {
      deltaSeconds: Math.PI / 12,
      position: RPG_WORLD_SPAWN,
      heading: [1, 0, 0] as const,
      rawMovement: { x: -1, y: 0 },
      moving: true,
      jumpHeight: 0
    };
    const state = createRpgPlayerSpriteRenderState(
      manifest,
      direction,
      motion,
      input
    )!;
    const expectedDirection = createPanoramaPlayerDirectionState();
    updatePanoramaPlayerDirection(expectedDirection, input.rawMovement, true);
    const expectedPose = advanceFlatPlayerMotion(createFlatPlayerMotionState(), {
      deltaSeconds: input.deltaSeconds,
      moving: true,
      horizontalIntent: -1,
      jumpHeight: 0,
      direction: expectedDirection.direction,
      runtimeManifest: manifest,
      sideFacing: expectedDirection.sideFacing
    });
    expect(state.direction).toBe("side");
    expect(state.flip).toBe(-1);
    expect(state.frame).toBe(
      selectPlayerRuntimeFrame(manifest, "side", true, expectedPose.strideFrame)
    );
  });

  it("draws the decoded frame on raw Canvas2D with the alpha foot at the registered foot", () => {
    const manifest = getSelectedPlayerRuntimeManifest("female");
    const state = createRpgPlayerSpriteRenderState(
      manifest,
      createPanoramaPlayerDirectionState(),
      createFlatPlayerMotionState(),
      {
        deltaSeconds: 1 / 60,
        position: RPG_WORLD_SPAWN,
        heading: [1, 0, 0],
        rawMovement: { x: 0, y: 0 },
        moving: false,
        jumpHeight: 0
      }
    )!;
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false
    } as unknown as CanvasRenderingContext2D;
    const bounds = drawRpgPlayerSprite(
      context,
      decodedImage(state.frame.asset),
      state,
      { footX: 430, footY: 590, displayHeight: 144 }
    );
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(bounds.height).toBe(144);
    expect(
      bounds.top + bounds.height - state.frame.footOffset * bounds.height
    ).toBeCloseTo(590, 8);
  });

  it("uses registration scale, keeps jump shadow grounded, and writes Canvas2D telemetry", () => {
    const manifest = getSelectedPlayerRuntimeManifest("female");
    const controller = createRpgPlayerSpriteController("female", new Map());
    const state = controller.applyFrame({
      deltaSeconds: 1 / 60,
      position: RPG_WORLD_SPAWN,
      heading: [1, 0, 0],
      rawMovement: { x: 0, y: 0 },
      moving: false,
      jumpHeight: 0
    })!;
    const projection = projectWorldToReference(RPG_WORLD_SPAWN)!;
    expect(state.planeHeight).toBe(
      RPG_PLAYER_SPRITE_REFERENCE_HEIGHT * projection.spriteScale
    );
    expect(state.shadowY).toBe(0);
    const canvas = document.createElement("canvas");
    writeRpgPlayerSpriteTelemetry(canvas, "female", state, true);
    expect(canvas.dataset.playerRenderer).toBe("canvas2d");
    expect(canvas.dataset.characterProjection).toBe("registered");
    expect(canvas.dataset.characterAsset).toBe(state.frame.asset);
    expect(manifest.frames).toContain(state.frame);
  });

  it("fails closed outside registration and preserves the approved alpha constant", () => {
    expect(
      createRpgPlayerSpriteRenderState(
        getSelectedPlayerRuntimeManifest("male"),
        createPanoramaPlayerDirectionState(),
        createFlatPlayerMotionState(),
        {
          deltaSeconds: 1 / 60,
          position: [16.6, 0, 0],
          heading: [1, 0, 0],
          rawMovement: { x: 0, y: 0 },
          moving: false,
          jumpHeight: 0
        }
      )
    ).toBeNull();
    expect(RPG_PLAYER_SPRITE_ALPHA_TEST).toBe(0.1);
  });
});
