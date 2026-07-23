import { describe, expect, it, vi } from "vitest";
import { createElement, createRef } from "react";
import { act, render } from "@testing-library/react";
import { getSelectedPlayerRuntimeManifest } from "../app/world/CharacterAssets";
import {
  applyRpgReferenceCanvasFrameTelemetry,
  applyRpgReferenceNavigationFrameInput,
  classifyRpgReferenceFrameUpdate,
  createFlatWorldPlayerSpriteFrameInput,
  resolveFlatWorldViewportProfile
} from "../app/world/FlatWorldCanvas";
import { calculateRpgReferenceCameraPlacement } from "../app/world/RpgCameraPlacement";
import {
  createFlatPlayerMotionState
} from "../app/world/FlatPlayerMotion";
import {
  createFlatWorldSession,
  createInitialFlatWorldNavigationSnapshot,
  type FlatWorldNavigationSnapshot
} from "../app/world/FlatWorldSession";
import { createInputController } from "../app/world/InputController";
import { createPanoramaPlayerDirectionState } from "../app/world/PanoramaPlayerDirection";
import {
  createRpgPlayerSpriteController,
  createRpgPlayerSpriteRenderState,
  drawRpgPlayerSprite,
  loadRpgPlayerSpriteImages,
  writeRpgPlayerSpriteTelemetry
} from "../app/world/RpgPlayerCharacterSprite";
import {
  createRpgMovementBuffer,
  createRpgScreenMovementTelemetry
} from "../app/world/RpgScreenMovement";
import {
  RPG_REFERENCE_FOREGROUND_CLIP_PATH_ID,
  RPG_REFERENCE_FOREGROUND_MASKS,
  RPG_REFERENCE_MAX_ORDINARY_STEP_CSS_PX,
  RpgReferenceSceneComposition,
  applyRpgReferenceLayerTransform,
  normalizeRpgReferenceForegroundPolygons,
  projectReferencePointToViewport,
  readAppliedRpgReferenceViewportTransform,
  resolveRpgReferenceViewportTransform,
  stepRpgReferenceViewportTransform,
  type RpgReferenceSceneCompositionHandle
} from "../app/world/RpgReferenceSceneComposition";
import {
  RPG_WORLD_BACKDROP_ASSET,
  RPG_WORLD_BACKDROP_IMAGE_SIZE,
  RpgWorldBackdrop,
  type RpgWorldBackdropHandle
} from "../app/world/RpgWorldBackdrop";
import {
  getNavigationRegionAt,
  isWalkable,
  projectWorldToReference
} from "../app/world/RpgWorldGeometry";
import {
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_SPAWN
} from "../app/world/RpgWorldModel";

const ORDINARY_STEP_EPSILON = 1e-6;
const FIRST_ORDINARY_MOVEMENT_DELTA_BY_ZONE = {
  airport: [0.05, 0],
  tokyo: [-0.05, 0],
  gyukatsu: [0.05, 0],
  sakura: [0, 0.05],
  hanabi: [-0.05, 0]
} as const satisfies Readonly<
  Record<
    (typeof RPG_WORLD_ARRIVALS)[number]["zoneId"],
    readonly [deltaX: number, deltaZ: number]
  >
>;

function createReferenceNavigationFrameHarness() {
  const session = createFlatWorldSession({
    bounds: RPG_WORLD_BOUNDS,
    start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
    moveSpeed: 3.4,
    canMoveTo: (x, z) => isWalkable([x, z])
  });
  const input = createInputController();
  const screenMovement = createRpgMovementBuffer();
  const worldMovement = createRpgMovementBuffer();
  const movementTelemetry = createRpgScreenMovementTelemetry();
  return {
    session,
    input,
    run(deltaSeconds = 1 / 60) {
      const discreteReason = applyRpgReferenceNavigationFrameInput({
        session,
        input,
        screenMovement,
        worldMovement,
        movementTelemetry,
        deltaSeconds
      });
      return {
        discreteReason,
        navigation: session.getNavigationSnapshot(),
        rawMovement: { ...screenMovement }
      };
    }
  };
}

function expectAtomicReferencePublication({
  previousNavigation,
  navigation,
  discreteReason,
  expectedReferenceFoot
}: {
  readonly previousNavigation: FlatWorldNavigationSnapshot;
  readonly navigation: FlatWorldNavigationSnapshot;
  readonly discreteReason: "reset" | "fast-travel";
  readonly expectedReferenceFoot: readonly [number, number];
}) {
  for (const profile of ["desktop", "mobile"] as const) {
    const previousPlacement = calculateRpgReferenceCameraPlacement({
      player: previousNavigation.position,
      profile,
      region: previousNavigation.navigationRegion
    });
    const placement = calculateRpgReferenceCameraPlacement({
      player: navigation.position,
      profile,
      region: navigation.navigationRegion
    });
    expect(previousPlacement, `${profile}:previous-placement`).not.toBeNull();
    expect(placement, `${profile}:committed-placement`).not.toBeNull();
    expect(
      placement!.playerReferenceProjection.pixel,
      `${profile}:committed-foot`
    ).toEqual(expectedReferenceFoot);

    const previousTransform = resolveRpgReferenceViewportTransform({
      profile,
      referenceFoot: previousPlacement!.playerReferenceProjection.pixel,
      navigationRegion: previousNavigation.navigationRegion,
      revision: 20,
      navigationRevision: previousNavigation.revision
    });
    const exactTransform = resolveRpgReferenceViewportTransform({
      profile,
      referenceFoot: placement!.playerReferenceProjection.pixel,
      navigationRegion: navigation.navigationRegion,
      revision: 21,
      navigationRevision: navigation.revision
    });
    expect(previousTransform, `${profile}:previous-transform`).not.toBeNull();
    expect(exactTransform, `${profile}:exact-transform`).not.toBeNull();
    const updateKind = classifyRpgReferenceFrameUpdate({
      discreteReason,
      profileChanged: false,
      recoveryPending: false
    });
    const publishedTransform = stepRpgReferenceViewportTransform({
      profile,
      referenceFoot: placement!.playerReferenceProjection.pixel,
      navigationRegion: navigation.navigationRegion,
      revision: 21,
      navigationRevision: navigation.revision,
      previous: previousTransform!,
      previousReferenceFoot:
        previousPlacement!.playerReferenceProjection.pixel,
      atomic: updateKind !== "ordinary"
    });
    expect(updateKind).toBe(discreteReason);
    expect(publishedTransform, `${profile}:published-transform`).toEqual(
      exactTransform
    );
  }
}

describe("RPG player sprite renderer integration", () => {
  it.each([
    [1440, 900, "desktop"],
    [1280, 800, "desktop"],
    [1366, 768, "desktop"],
    [390, 844, "mobile"],
    [375, 812, "mobile"],
    [393, 852, "mobile"],
    [412, 915, "mobile"]
  ] as const)(
    "resolves the %sx%s viewport to the %s world profile",
    (width, height, profile) => {
      expect(resolveFlatWorldViewportProfile(width, height)).toBe(profile);
    }
  );

  it.each([
    [0, 0],
    [319, 568],
    [844, 390],
    [1440, 500],
    [2560, 900]
  ] as const)("rejects the unsupported %sx%s viewport", (width, height) => {
    expect(resolveFlatWorldViewportProfile(width, height)).toBeNull();
  });

  it.each([
    {
      profile: "desktop",
      viewport: { width: 1280, height: 800 },
      safeFrame: { x: 0, y: 0, width: 1280, height: 800 }
    },
    {
      profile: "desktop",
      viewport: { width: 1366, height: 768 },
      safeFrame: { x: 0, y: 0, width: 1366, height: 768 }
    },
    {
      profile: "mobile",
      viewport: { width: 375, height: 812 },
      safeFrame: { x: 0, y: 64, width: 375, height: 748 }
    },
    {
      profile: "mobile",
      viewport: { width: 412, height: 915 },
      safeFrame: { x: 0, y: 64, width: 412, height: 851 }
    }
  ] as const)(
    "fills the live $viewport.width x $viewport.height $profile safe frame",
    ({ profile, viewport, safeFrame }) => {
      const navigation = createInitialFlatWorldNavigationSnapshot();
      const placement = calculateRpgReferenceCameraPlacement({
        player: navigation.position,
        profile,
        region: navigation.navigationRegion
      });
      expect(placement).not.toBeNull();

      const transform = resolveRpgReferenceViewportTransform({
        profile,
        viewport,
        referenceFoot: placement!.playerReferenceProjection.pixel,
        navigationRegion: navigation.navigationRegion,
        revision: 0,
        navigationRevision: navigation.revision
      });
      expect(transform).not.toBeNull();
      expect(transform!.safeFrame).toEqual(safeFrame);
      expect(transform!.imageFrame.x).toBeLessThanOrEqual(safeFrame.x);
      expect(transform!.imageFrame.y).toBeLessThanOrEqual(safeFrame.y);
      expect(
        transform!.imageFrame.x + transform!.imageFrame.width
      ).toBeGreaterThanOrEqual(safeFrame.x + safeFrame.width);
      expect(
        transform!.imageFrame.y + transform!.imageFrame.height
      ).toBeGreaterThanOrEqual(safeFrame.y + safeFrame.height);

      const foot = projectReferencePointToViewport(
        placement!.playerReferenceProjection.pixel,
        transform!
      );
      expect(foot[0]).toBeGreaterThanOrEqual(safeFrame.x);
      expect(foot[0]).toBeLessThanOrEqual(safeFrame.x + safeFrame.width);
      expect(foot[1]).toBeGreaterThanOrEqual(safeFrame.y);
      expect(foot[1]).toBeLessThanOrEqual(safeFrame.y + safeFrame.height);
    }
  );

  it("uses the actual model projection for all five canonical scene feet", () => {
    const targets = {
      airport: [430, 600],
      tokyo: [760, 455],
      gyukatsu: [1035, 610],
      sakura: [1260, 595],
      hanabi: [1570, 640]
    } as const;
    const actual = Object.fromEntries(
      RPG_WORLD_ARRIVALS.map((arrival) => [
        arrival.zoneId,
        projectWorldToReference(arrival.position)?.pixel ?? null
      ])
    );
    expect(actual).toEqual(targets);
  });

  it.each(["desktop", "mobile"] as const)(
    "keeps every exact arrival ready through its first ordinary %s movement",
    (profile) => {
      const updateKind = classifyRpgReferenceFrameUpdate({
        discreteReason: null,
        profileChanged: false,
        recoveryPending: false
      });
      expect(updateKind).toBe("ordinary");

      for (const [index, arrival] of RPG_WORLD_ARRIVALS.entries()) {
        const label = `${profile}:${arrival.zoneId}`;
        const arrivalProjection = projectWorldToReference(arrival.position);
        const arrivalRegion = getNavigationRegionAt(arrival.position);
        const [deltaX, deltaZ] =
          FIRST_ORDINARY_MOVEMENT_DELTA_BY_ZONE[arrival.zoneId];
        const nextWorld = [
          arrival.position[0] + deltaX,
          arrival.position[1],
          arrival.position[2] + deltaZ
        ] as const;
        const nextProjection = projectWorldToReference(nextWorld);
        const nextRegion = getNavigationRegionAt(nextWorld);

        expect(arrivalProjection, `${label}:arrival-projection`).not.toBeNull();
        expect(
          arrivalProjection!.pixel,
          `${label}:exact-arrival-foot`
        ).toEqual(arrival.approvedReferenceFoot.pixel);
        expect(arrivalRegion, `${label}:arrival-region`).not.toBeNull();
        expect(isWalkable(arrival.position), `${label}:arrival-walkable`).toBe(
          true
        );
        expect(isWalkable(nextWorld), `${label}:next-walkable`).toBe(true);
        expect(nextProjection, `${label}:next-projection`).not.toBeNull();
        expect(nextRegion, `${label}:next-region`).not.toBeNull();
        expect(
          calculateRpgReferenceCameraPlacement({
            player: arrival.position,
            profile,
            region: arrivalRegion!
          }),
          `${label}:arrival-placement`
        ).not.toBeNull();
        expect(
          calculateRpgReferenceCameraPlacement({
            player: nextWorld,
            profile,
            region: nextRegion!
          }),
          `${label}:next-placement`
        ).not.toBeNull();

        const previous = resolveRpgReferenceViewportTransform({
          profile,
          referenceFoot: arrivalProjection!.pixel,
          navigationRegion: arrivalRegion!,
          revision: index * 2,
          navigationRevision: index * 2
        });
        expect(previous, `${label}:arrival-transform`).not.toBeNull();
        const next = stepRpgReferenceViewportTransform({
          profile,
          referenceFoot: nextProjection!.pixel,
          navigationRegion: nextRegion!,
          revision: index * 2 + 1,
          navigationRevision: index * 2 + 1,
          previous: previous!,
          previousReferenceFoot: arrivalProjection!.pixel,
          atomic: updateKind !== "ordinary"
        });
        expect(next, `${label}:ordinary-transform`).not.toBeNull();

        expect(
          Math.hypot(
            next!.imageFrame.x - previous!.imageFrame.x,
            next!.imageFrame.y - previous!.imageFrame.y
          ),
          `${label}:backdrop-css-delta`
        ).toBeLessThanOrEqual(
          RPG_REFERENCE_MAX_ORDINARY_STEP_CSS_PX + ORDINARY_STEP_EPSILON
        );
        const previousScreenFoot = projectReferencePointToViewport(
          arrivalProjection!.pixel,
          previous!
        );
        const nextScreenFoot = projectReferencePointToViewport(
          nextProjection!.pixel,
          next!
        );
        expect(
          Math.hypot(
            nextScreenFoot[0] - previousScreenFoot[0],
            nextScreenFoot[1] - previousScreenFoot[1]
          ),
          `${label}:player-foot-css-delta`
        ).toBeLessThanOrEqual(
          RPG_REFERENCE_MAX_ORDINARY_STEP_CSS_PX + ORDINARY_STEP_EPSILON
        );
      }
    }
  );

  it("publishes fast travel before held keyboard movement and queued jump", () => {
    const harness = createReferenceNavigationFrameHarness();
    const previousNavigation = harness.session.getNavigationSnapshot();
    const readMovement = vi.spyOn(harness.input, "readMovement");
    const consumeJump = vi.spyOn(harness.input, "consumeJump");
    const advance = vi.spyOn(harness.session, "advance");
    const hanabi = RPG_WORLD_ARRIVALS.find(
      ({ zoneId }) => zoneId === "hanabi"
    )!;
    harness.input.pressKey("ArrowLeft");
    harness.input.queueJump();
    harness.input.queueTravel("hanabi");

    const committed = harness.run();
    expect(committed.discreteReason).toBe("fast-travel");
    expect(committed.navigation.revision).toBe(previousNavigation.revision + 1);
    expect(committed.navigation.position).toEqual(hanabi.position);
    expect(committed.navigation.moving).toBe(false);
    expect(committed.navigation.grounded).toBe(true);
    expect(committed.rawMovement).toEqual({ x: 0, y: 0 });
    expect(readMovement).not.toHaveBeenCalled();
    expect(consumeJump).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    expectAtomicReferencePublication({
      previousNavigation,
      navigation: committed.navigation,
      discreteReason: "fast-travel",
      expectedReferenceFoot: hanabi.approvedReferenceFoot.pixel
    });

    const ordinary = harness.run();
    expect(ordinary.discreteReason).toBeNull();
    expect(ordinary.rawMovement).toEqual({ x: -1, y: 0 });
    expect(ordinary.navigation.revision).toBeGreaterThan(
      committed.navigation.revision
    );
    expect(ordinary.navigation.position[0]).toBeLessThan(hanabi.position[0]);
    expect(ordinary.navigation.position[1]).toBeGreaterThan(0);
    expect(ordinary.navigation.moving).toBe(true);
    expect(ordinary.navigation.grounded).toBe(false);
    expect(readMovement).toHaveBeenCalledTimes(1);
    expect(consumeJump).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it("publishes reset before held touch movement and queued jump", () => {
    const harness = createReferenceNavigationFrameHarness();
    expect(harness.session.teleport(-29, 1.5)).toBe(true);
    const previousNavigation = harness.session.getNavigationSnapshot();
    const readMovement = vi.spyOn(harness.input, "readMovement");
    const consumeJump = vi.spyOn(harness.input, "consumeJump");
    const advance = vi.spyOn(harness.session, "advance");
    harness.input.setTouchMovement({ x: 1, y: 0 });
    harness.input.queueJump();
    harness.input.queueReset();

    const committed = harness.run();
    expect(committed.discreteReason).toBe("reset");
    expect(committed.navigation.revision).toBe(previousNavigation.revision + 1);
    expect(committed.navigation.position).toEqual(RPG_WORLD_SPAWN);
    expect(committed.navigation.moving).toBe(false);
    expect(committed.navigation.grounded).toBe(true);
    expect(committed.rawMovement).toEqual({ x: 0, y: 0 });
    expect(readMovement).not.toHaveBeenCalled();
    expect(consumeJump).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    expectAtomicReferencePublication({
      previousNavigation,
      navigation: committed.navigation,
      discreteReason: "reset",
      expectedReferenceFoot: projectWorldToReference(RPG_WORLD_SPAWN)!.pixel
    });

    const ordinary = harness.run();
    expect(ordinary.discreteReason).toBeNull();
    expect(ordinary.rawMovement).toEqual({ x: 1, y: 0 });
    expect(ordinary.navigation.revision).toBeGreaterThan(
      committed.navigation.revision
    );
    expect(
      Math.hypot(
        ordinary.navigation.position[0] - RPG_WORLD_SPAWN[0],
        ordinary.navigation.position[2] - RPG_WORLD_SPAWN[2]
      )
    ).toBeGreaterThan(0);
    expect(ordinary.navigation.position[1]).toBeGreaterThan(0);
    expect(ordinary.navigation.moving).toBe(true);
    expect(ordinary.navigation.grounded).toBe(false);
    expect(readMovement).toHaveBeenCalledTimes(1);
    expect(consumeJump).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it("commits one exact transform to stable same-source HTML backdrop and foreground images", () => {
    const transform = resolveRpgReferenceViewportTransform({
      profile: "mobile",
      referenceFoot: [1260, 595],
      navigationRegion: {
        kind: "zone",
        regionId: "sakura",
        displayZoneId: "sakura",
        highlightedZoneIds: ["sakura"]
      },
      revision: 12,
      navigationRevision: 31
    })!;
    const handle = createRef<RpgReferenceSceneCompositionHandle>();
    const backdropHandle = createRef<RpgWorldBackdropHandle>();
    const view = render(
      createElement(
        "div",
        null,
        createElement(RpgWorldBackdrop, {
          ref: backdropHandle,
          sourceOffset: transform.sourceOffsetX,
          backdropScale: transform.scale,
          safeFrame: transform.safeFrame,
          sharedTransform: transform
        }),
        createElement(RpgReferenceSceneComposition, {
          ref: handle,
          transform,
          zoneId: "sakura"
        })
      )
    );
    const frame = view.container.querySelector(
      '[data-rpg-reference-layer="foreground-frame"]'
    ) as HTMLElement;
    const sourceImage = view.container.querySelector(
      '[data-rpg-reference-foreground-image="single"]'
    ) as HTMLImageElement;
    const defsSvg = frame.querySelector(
      '[data-rpg-reference-foreground-defs="normalized"]'
    ) as SVGSVGElement;
    const clipPath = defsSvg.querySelector("clipPath")!;
    const backdropFrame = view.container.querySelector(
      '[data-rpg-world-backdrop="approved-image"]'
    ) as HTMLElement;
    const backdropImage = backdropFrame.querySelector(
      '[data-rpg-world-backdrop-image="single"]'
    ) as HTMLImageElement;
    const canvasFrame = document.createElement("div");
    const shadow = document.createElement("div");
    applyRpgReferenceCanvasFrameTelemetry(
      canvasFrame,
      backdropFrame,
      transform
    );
    applyRpgReferenceLayerTransform(shadow, transform, "player-shadow");
    Object.defineProperties(sourceImage, {
      complete: { configurable: true, value: true },
      naturalWidth: {
        configurable: true,
        value: RPG_WORLD_BACKDROP_IMAGE_SIZE[0]
      },
      naturalHeight: {
        configurable: true,
        value: RPG_WORLD_BACKDROP_IMAGE_SIZE[1]
      }
    });

    expect(frame.style.visibility).toBe("hidden");
    expect(frame.style.zIndex).toBe("1");
    expect(frame.dataset.rpgReferenceForegroundCrossing).toBe("none");
    expect(frame.dataset.rpgReferenceForegroundVisible).toBe("false");
    expect(frame.dataset.rpgReferenceForegroundAbovePlayer).toBe("false");

    act(() => {
      expect(backdropHandle.current!.applyTransform(transform)).toBe(true);
      expect(
        handle.current!.applyTransform(transform, "sakura", "behind")
      ).toBe(true);
    });
    expect(readAppliedRpgReferenceViewportTransform(frame)).toBe(transform);
    expect(readAppliedRpgReferenceViewportTransform(sourceImage)).toBe(
      transform
    );
    expect(frame.style.visibility).toBe("visible");
    expect(frame.style.zIndex).toBe("3");
    expect(frame.dataset.rpgReferenceForegroundCrossing).toBe("behind");
    expect(frame.dataset.rpgReferenceForegroundVisible).toBe("true");
    expect(frame.dataset.rpgReferenceForegroundAbovePlayer).toBe("true");
    expect(frame.dataset.rpgReferenceTransformIdentity).toBe("31:12");
    expect(sourceImage.dataset.rpgReferenceTransformIdentity).toBe("31:12");
    const sharedSafeFrame = "0,64,390,780";
    for (const layer of [backdropFrame, canvasFrame, shadow, frame]) {
      expect(layer.dataset.rpgReferenceSafeFrame).toBe(sharedSafeFrame);
      expect(layer.dataset.rpgReferenceTransformRevision).toBe("12");
      expect(layer.dataset.rpgReferenceNavigationRevision).toBe("31");
      expect(layer.dataset.rpgReferenceTransformIdentity).toBe("31:12");
    }
    expect(frame.dataset.rpgReferenceForegroundImageCount).toBe("1");
    expect(frame.dataset.rpgReferenceForegroundSourceCount).toBe("1");
    expect(frame.dataset.rpgReferenceForegroundMask).toBe(
      "sakura-tree-canal-rail-foreground"
    );
    expect(sourceImage).toBeInstanceOf(HTMLImageElement);
    expect(sourceImage.getAttribute("src")).toBe(RPG_WORLD_BACKDROP_ASSET);
    expect(backdropImage.getAttribute("src")).toBe(
      RPG_WORLD_BACKDROP_ASSET
    );
    expect(sourceImage.style.clipPath).toContain(
      RPG_REFERENCE_FOREGROUND_CLIP_PATH_ID
    );
    expect(frame.querySelectorAll("img")).toHaveLength(1);
    expect(defsSvg.querySelector("image")).toBeNull();
    expect(defsSvg.getAttribute("width")).toBe("0");
    expect(defsSvg.getAttribute("height")).toBe("0");
    expect(clipPath.id).toBe(RPG_REFERENCE_FOREGROUND_CLIP_PATH_ID);
    expect(clipPath.getAttribute("clipPathUnits")).toBe(
      "objectBoundingBox"
    );
    const sakuraMask = RPG_REFERENCE_FOREGROUND_MASKS.find(
      ({ zoneId }) => zoneId === "sakura"
    )!;
    const normalizedSakura = sakuraMask.polygons.map((polygon) =>
      polygon.map(([x, y]) => [
        x / RPG_WORLD_BACKDROP_IMAGE_SIZE[0],
        y / RPG_WORLD_BACKDROP_IMAGE_SIZE[1]
      ])
    );
    expect(JSON.parse(frame.dataset.rpgReferenceForegroundClip!)).toEqual(
      normalizedSakura
    );
    expect(
      JSON.parse(frame.dataset.rpgReferenceForegroundSourceClip!)
    ).toEqual(sakuraMask.polygons);
    expect(clipPath.querySelectorAll("polygon")).toHaveLength(1);
    expect(
      clipPath.querySelector("polygon")!.getAttribute("points")
    ).toBe(
      normalizedSakura
        .map((polygon) =>
          polygon.map(([x, y]) => `${x},${y}`).join(" ")
        )
        .join("")
    );
    for (const property of [
      "left",
      "top",
      "width",
      "height",
      "max-width",
      "display",
      "opacity",
      "filter",
      "mix-blend-mode",
      "user-select"
    ]) {
      expect(
        sourceImage.style.getPropertyValue(property),
        property
      ).toBe(backdropImage.style.getPropertyValue(property));
    }
    for (const image of [backdropImage, sourceImage]) {
      expect(image.dataset.rpgReferenceTransformRevision).toBe("12");
      expect(image.dataset.rpgReferenceNavigationRevision).toBe("31");
      expect(image.dataset.rpgReferenceTransformIdentity).toBe("31:12");
      expect(image.dataset.rpgReferenceImageFrame).toBe(
        sourceImage.dataset.rpgReferenceImageFrame
      );
      expect(image.dataset.rpgReferenceSafeFrame).toBe(sharedSafeFrame);
    }
    expect(frame.dataset.rpgReferenceForegroundImageComplete).toBe("true");
    expect(frame.dataset.rpgReferenceForegroundNaturalWidth).toBe("1817");
    expect(frame.dataset.rpgReferenceForegroundNaturalHeight).toBe("866");

    const stableSourceImage = sourceImage;
    const stableDefsSvg = defsSvg;
    const stableClipPath = clipPath;
    const airportTransform = resolveRpgReferenceViewportTransform({
      profile: "mobile",
      referenceFoot: [455, 620],
      navigationRegion: {
        kind: "zone",
        regionId: "airport",
        displayZoneId: "airport",
        highlightedZoneIds: ["airport"]
      },
      revision: 13,
      navigationRevision: 32
    })!;

    act(() => {
      expect(
        backdropHandle.current!.applyTransform(airportTransform)
      ).toBe(true);
      expect(
        handle.current!.applyTransform(
          airportTransform,
          "airport",
          "behind"
        )
      ).toBe(true);
    });
    expect(
      view.container.querySelector(
        '[data-rpg-reference-foreground-image="single"]'
      )
    ).toBe(stableSourceImage);
    expect(
      frame.querySelector(
        '[data-rpg-reference-foreground-defs="normalized"]'
      )
    ).toBe(stableDefsSvg);
    expect(stableDefsSvg.querySelector("clipPath")).toBe(stableClipPath);
    expect(stableClipPath.id).toBe(
      RPG_REFERENCE_FOREGROUND_CLIP_PATH_ID
    );
    expect(stableClipPath.querySelectorAll("polygon")).toHaveLength(2);
    expect(frame.dataset.rpgReferenceForegroundMask).toBe(
      "airport-shelter-planter-foreground"
    );
    const airportMask = RPG_REFERENCE_FOREGROUND_MASKS.find(
      ({ zoneId }) => zoneId === "airport"
    )!;
    expect(JSON.parse(frame.dataset.rpgReferenceForegroundClip!)).toEqual(
      airportMask.polygons.map((polygon) =>
        polygon.map(([x, y]) => [
          x / RPG_WORLD_BACKDROP_IMAGE_SIZE[0],
          y / RPG_WORLD_BACKDROP_IMAGE_SIZE[1]
        ])
      )
    );
    expect(
      JSON.parse(frame.dataset.rpgReferenceForegroundSourceClip!)
    ).toEqual(airportMask.polygons);
    expect(frame.dataset.rpgReferenceTransformIdentity).toBe("32:13");
    expect(sourceImage.dataset.rpgReferenceTransformIdentity).toBe("32:13");
    expect(backdropImage.dataset.rpgReferenceTransformIdentity).toBe("32:13");
    for (const property of [
      "left",
      "top",
      "width",
      "height",
      "max-width",
      "display",
      "opacity",
      "filter",
      "mix-blend-mode",
      "user-select"
    ]) {
      expect(
        sourceImage.style.getPropertyValue(property),
        property
      ).toBe(backdropImage.style.getPropertyValue(property));
    }

    act(() => {
      expect(
        handle.current!.applyTransform(
          airportTransform,
          "airport",
          "front"
        )
      ).toBe(true);
    });
    expect(readAppliedRpgReferenceViewportTransform(frame)).toBe(
      airportTransform
    );
    expect(readAppliedRpgReferenceViewportTransform(sourceImage)).toBe(
      airportTransform
    );
    expect(
      view.container.querySelector(
        '[data-rpg-reference-foreground-image="single"]'
      )
    ).toBe(stableSourceImage);
    expect(frame.style.visibility).toBe("hidden");
    expect(frame.style.zIndex).toBe("1");
    expect(frame.dataset.rpgReferenceForegroundCrossing).toBe("front");
    expect(frame.dataset.rpgReferenceForegroundVisible).toBe("false");
    expect(frame.dataset.rpgReferenceForegroundAbovePlayer).toBe("false");

    act(() => {
      expect(
        handle.current!.applyTransform(
          airportTransform,
          "airport",
          null
        )
      ).toBe(true);
    });
    expect(
      view.container.querySelector(
        '[data-rpg-reference-foreground-image="single"]'
      )
    ).toBe(stableSourceImage);
    expect(stableClipPath.querySelectorAll("polygon")).toHaveLength(2);
    expect(frame.style.visibility).toBe("hidden");
    expect(frame.style.zIndex).toBe("1");
    expect(frame.dataset.rpgReferenceForegroundCrossing).toBe("none");
    expect(frame.dataset.rpgReferenceForegroundVisible).toBe("false");
    expect(frame.dataset.rpgReferenceForegroundAbovePlayer).toBe("false");
  });

  it("fails foreground polygon normalization closed", () => {
    expect(
      normalizeRpgReferenceForegroundPolygons([
        [[0, 0], [10, 10], [20, 20]]
      ])
    ).toBeNull();
    expect(
      normalizeRpgReferenceForegroundPolygons([
        [[0, 0], [1818, 0], [0, 10]]
      ])
    ).toBeNull();
    expect(
      normalizeRpgReferenceForegroundPolygons([
        [[0, 0], [10, Number.NaN], [0, 10]]
      ])
    ).toBeNull();
  });

  it("copies the immutable navigation and raw input contract into the live sprite frame", () => {
    const navigation = createInitialFlatWorldNavigationSnapshot();
    const rawMovement = { x: -1, y: 0.25 };
    const frame = createFlatWorldPlayerSpriteFrameInput(
      navigation,
      rawMovement,
      1 / 60
    );

    rawMovement.x = 1;
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame.rawMovement)).toBe(true);
    expect(frame.position).toBe(navigation.position);
    expect(frame.heading).toBe(navigation.heading);
    expect(frame.rawMovement).toEqual({ x: -1, y: 0.25 });
    expect(frame.moving).toBe(navigation.moving);
    expect(frame.jumpHeight).toBe(navigation.position[1]);
  });

  it("loads the selected identity boundary without requesting the other identity", async () => {
    const requested: string[] = [];
    const images = await loadRpgPlayerSpriteImages(
      getSelectedPlayerRuntimeManifest("female"),
      (asset) => {
        requested.push(asset);
        const image = document.createElement("img");
        image.setAttribute("src", asset);
        Object.defineProperties(image, {
          naturalWidth: { value: 768 },
          naturalHeight: { value: 1152 }
        });
        image.decode = vi.fn(async () => undefined);
        return image;
      }
    );

    expect(requested).toHaveLength(8);
    expect(new Set(requested).size).toBe(8);
    expect(requested.every((asset) => asset.includes("player-female"))).toBe(
      true
    );
    expect(requested.some((asset) => asset.includes("player-male"))).toBe(
      false
    );
    expect(images).toHaveLength(8);
  });

  it("draws a mirrored ready frame through raw Canvas2D only", () => {
    const navigation = createInitialFlatWorldNavigationSnapshot();
    const frame = createFlatWorldPlayerSpriteFrameInput(
      navigation,
      { x: -1, y: 0 },
      Math.PI / 12
    );
    const state = createRpgPlayerSpriteRenderState(
      getSelectedPlayerRuntimeManifest("male"),
      createPanoramaPlayerDirectionState(),
      createFlatPlayerMotionState(),
      { ...frame, moving: true }
    )!;
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false
    } as unknown as CanvasRenderingContext2D;
    const image = document.createElement("img");
    const bounds = drawRpgPlayerSprite(context, image, state, {
      footX: 430,
      footY: 590,
      displayHeight: 144
    });
    expect(context.translate).toHaveBeenCalledWith(860, 0);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(bounds.height).toBe(144);
  });

  it("keeps the Canvas2D controller independent from live Three objects", () => {
    const controller = createRpgPlayerSpriteController("male", new Map());
    expect(controller.character).toBe("male");
    expect(controller.images).toBeInstanceOf(Map);
    expect(controller.applyFrame).toBeTypeOf("function");
  });

  it("writes behavior telemetry to a real canvas without renderer naming", () => {
    const navigation = createInitialFlatWorldNavigationSnapshot();
    const state = createRpgPlayerSpriteRenderState(
      getSelectedPlayerRuntimeManifest("female"),
      createPanoramaPlayerDirectionState(),
      createFlatPlayerMotionState(),
      createFlatWorldPlayerSpriteFrameInput(
        navigation,
        { x: 0, y: 0 },
        1 / 60
      )
    )!;
    const canvas = document.createElement("canvas");

    writeRpgPlayerSpriteTelemetry(canvas, "female", state, true);
    expect(canvas.dataset).toMatchObject({
      characterReady: "true",
      characterId: "female",
      characterAsset: state.frame.asset,
      characterDirection: state.direction,
      characterFlip: String(state.flip),
      characterFrame: String(state.frame.frame),
      locomotionState: state.locomotion,
      referenceTriangle: state.projection.triangleId,
      activeDepthBand: state.activeBand ?? "none",
      playerGrounded: "true",
      playerEnvelopeSubset: "true",
      playerEnvelopePolicy: "airborne-telemetry-only",
      playerRenderer: "canvas2d"
    });
  });
});
