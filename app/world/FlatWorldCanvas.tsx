"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { DestinationId } from "../guide/GuideContract";
import { getSelectedPlayerRuntimeManifest } from "./CharacterAssets";
import type { FlatCameraProfileId } from "./FlatCameraPlacement";
import { adaptFlatWorldNavigationSnapshot } from "./FlatWorldNavigationAdapter";
import {
  createFlatWorldSession,
  createInitialFlatWorldNavigationSnapshot,
  getFlatWorldAdvanceSeconds,
  type FlatWorldNavigationSnapshot,
  type FlatWorldSession
} from "./FlatWorldSession";
import {
  RpgReferenceSceneComposition,
  applyRpgReferenceLayerTransform,
  projectReferencePointToViewport,
  resolveRpgReferenceViewportTransform,
  stepRpgReferenceViewportTransform,
  type RpgReferenceSceneCompositionHandle,
  type RpgReferenceViewportTransform
} from "./RpgReferenceSceneComposition";
import { calculateRpgReferenceCameraPlacement } from "./RpgCameraPlacement";
import {
  createRpgPlayerSpriteController,
  drawRpgPlayerSprite,
  loadRpgPlayerSpriteImages,
  writeRpgPlayerSpriteTelemetry,
  type RpgPlayerSpriteController,
  type RpgPlayerSpriteFrameInput
} from "./RpgPlayerCharacterSprite";
import {
  createRpgMovementBuffer,
  createRpgScreenMovementTelemetry,
  mapRpgScreenMovementInto,
  type RpgScreenMovementTelemetry
} from "./RpgScreenMovement";
import {
  RPG_WORLD_BACKDROP_IMAGE_SIZE,
  RpgWorldBackdrop,
  type RpgWorldBackdropHandle
} from "./RpgWorldBackdrop";
import { isWalkable } from "./RpgWorldGeometry";
import { RPG_WORLD_BOUNDS, RPG_WORLD_SPAWN } from "./RpgWorldModel";
import type { InputController } from "./InputController";
import type { PlayerCharacter } from "./WorldView";
import type { WorldMovementIntent } from "./WorldInput";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import type { MovementIntent } from "./WorldSession";

interface FlatWorldCanvasProps {
  character: PlayerCharacter;
  input: InputController;
  activeDestinationId: DestinationId | null;
  onNavigationChange: (navigation: WorldNavigationSnapshot) => void;
}

const WORLD_START = {
  x: RPG_WORLD_SPAWN[0],
  z: RPG_WORLD_SPAWN[2]
} as const;
const PLAYER_MOVE_SPEED = 3.4;

export function createFlatWorldPlayerSpriteFrameInput(
  navigation: FlatWorldNavigationSnapshot,
  rawMovement: Readonly<MovementIntent>,
  deltaSeconds: number
): RpgPlayerSpriteFrameInput {
  return Object.freeze({
    deltaSeconds,
    position: navigation.position,
    heading: navigation.heading,
    rawMovement: Object.freeze({ x: rawMovement.x, y: rawMovement.y }),
    moving: navigation.moving,
    jumpHeight: navigation.position[1]
  });
}

export type RpgReferenceFrameUpdateKind =
  | "ordinary"
  | "fast-travel"
  | "teleport"
  | "reset"
  | "resize"
  | "recovery";

export function classifyRpgReferenceFrameUpdate({
  discreteReason,
  profileChanged,
  recoveryPending
}: {
  readonly discreteReason: "fast-travel" | "teleport" | "reset" | null;
  readonly profileChanged: boolean;
  readonly recoveryPending: boolean;
}): RpgReferenceFrameUpdateKind {
  if (discreteReason) return discreteReason;
  if (profileChanged) return "resize";
  if (recoveryPending) return "recovery";
  return "ordinary";
}

export function applyRpgReferenceNavigationFrameInput({
  session,
  input,
  screenMovement,
  worldMovement,
  movementTelemetry,
  deltaSeconds
}: {
  readonly session: FlatWorldSession;
  readonly input: InputController;
  readonly screenMovement: WorldMovementIntent;
  readonly worldMovement: MovementIntent;
  readonly movementTelemetry: RpgScreenMovementTelemetry;
  readonly deltaSeconds: number;
}): "reset" | null {
  let discreteReason: "reset" | null = null;
  if (input.consumeReset()) {
    session.reset();
    discreteReason = "reset";
  }
  if (discreteReason) {
    screenMovement.x = 0;
    screenMovement.y = 0;
    screenMovement.runRequested = false;
    worldMovement.x = 0;
    worldMovement.y = 0;
    movementTelemetry.usedCompatibilityWorldPosition = false;
    session.setMovement(worldMovement);
    return discreteReason;
  }
  const rawMovement = input.readMovement(screenMovement);
  mapRpgScreenMovementInto(
    {
      screen: rawMovement,
      cameraAzimuthDegrees: 0,
      worldPosition: session.getNavigationSnapshot().position,
      telemetry: movementTelemetry
    },
    worldMovement
  );
  session.setMovement(worldMovement);
  if (input.consumeJump()) session.jump();
  session.advance(deltaSeconds);
  return null;
}

export function applyRpgReferenceCanvasFrameTelemetry(
  canvasFrame: HTMLElement,
  backdrop: HTMLElement,
  transform: RpgReferenceViewportTransform
) {
  const safeFrame = [
    transform.safeFrame.x,
    transform.safeFrame.y,
    transform.safeFrame.width,
    transform.safeFrame.height
  ].join(",");
  const imageFrame = [
    transform.imageFrame.x,
    transform.imageFrame.y,
    transform.imageFrame.width,
    transform.imageFrame.height
  ].join(",");
  const identity = `${transform.navigationRevision}:${transform.revision}`;
  canvasFrame.style.left = `${transform.safeFrame.x}px`;
  canvasFrame.style.top = `${transform.safeFrame.y}px`;
  canvasFrame.style.width = `${transform.safeFrame.width}px`;
  canvasFrame.style.height = `${transform.safeFrame.height}px`;
  for (const element of [canvasFrame, backdrop]) {
    element.dataset.rpgReferenceSafeFrame = safeFrame;
    element.dataset.rpgReferenceTransformRevision = String(transform.revision);
    element.dataset.rpgReferenceNavigationRevision = String(
      transform.navigationRevision
    );
    element.dataset.rpgReferenceTransformIdentity = identity;
    element.dataset.rpgReferenceImageFrame = imageFrame;
  }
}

interface FlatWorldViewport {
  readonly width: number;
  readonly height: number;
  readonly profileId: FlatCameraProfileId | null;
}

interface ValidFrame {
  readonly navigation: FlatWorldNavigationSnapshot;
  readonly transform: RpgReferenceViewportTransform;
  readonly referenceFoot: readonly [number, number];
}

interface ShadowContract {
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly blur: number;
  readonly footOffset: number;
}

export function resolveFlatWorldViewportProfile(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  if (width >= 320 && width <= 768 && height >= 568 && height >= width) {
    return "mobile" as const;
  }
  const aspectRatio = width / height;
  const maximumBackdropAspectRatio =
    RPG_WORLD_BACKDROP_IMAGE_SIZE[0] / RPG_WORLD_BACKDROP_IMAGE_SIZE[1];
  if (
    width >= 768 &&
    height >= 600 &&
    aspectRatio <= maximumBackdropAspectRatio
  ) {
    return "desktop" as const;
  }
  return null;
}

function playerDisplayHeight(
  profile: FlatCameraProfileId,
  zoneId: DestinationId
) {
  if (profile === "mobile") return zoneId === "hanabi" ? 122 : 122;
  return {
    airport: 144,
    tokyo: 128,
    gyukatsu: 138,
    sakura: 144,
    hanabi: 128
  }[zoneId];
}

function shadowContract(
  profile: FlatCameraProfileId,
  zoneId: DestinationId
): ShadowContract {
  if (profile === "mobile") {
    return { width: 48, height: 14, opacity: 0.46, blur: 1.5, footOffset: 4 };
  }
  if (zoneId === "airport") {
    return { width: 58, height: 15, opacity: 0.42, blur: 2, footOffset: 4 };
  }
  if (zoneId === "hanabi") {
    return { width: 50, height: 14, opacity: 0.44, blur: 2, footOffset: 4 };
  }
  return { width: 52, height: 14, opacity: 0.43, blur: 2, footOffset: 4 };
}

function viewportContentScale(
  profile: FlatCameraProfileId,
  transform: RpgReferenceViewportTransform
) {
  return profile === "mobile"
    ? transform.safeFrame.height / 780
    : transform.safeFrame.height / 900;
}

function writeTelemetry(
  renderer: HTMLElement,
  canvas: HTMLCanvasElement,
  values: Readonly<Record<string, string>>
) {
  for (const target of [renderer, canvas]) {
    for (const [key, value] of Object.entries(values)) {
      target.dataset[key] = value;
    }
  }
}

function clearPlayerCanvas(canvas: HTMLCanvasElement) {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

function FlatWorldCanvas(props: FlatWorldCanvasProps) {
  const {
    character,
    input,
    activeDestinationId,
    onNavigationChange
  } = props;
  const rendererRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<RpgWorldBackdropHandle>(null);
  const compositionRef = useRef<RpgReferenceSceneCompositionHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(
    createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: WORLD_START,
      moveSpeed: PLAYER_MOVE_SPEED,
      canMoveTo: (x, z) => isWalkable([x, z])
    })
  );
  const controllerRef = useRef<RpgPlayerSpriteController | null>(null);
  const lastValidFrameRef = useRef<ValidFrame | null>(null);
  const lastProfileRef = useRef<FlatCameraProfileId | null>(null);
  const recoveryPendingRef = useRef(false);
  const screenMovementRef = useRef<WorldMovementIntent>({
    x: 0,
    y: 0,
    runRequested: false
  });
  const worldMovementRef = useRef(createRpgMovementBuffer());
  const movementTelemetryRef = useRef(createRpgScreenMovementTelemetry());
  const lastNavigationRevisionRef = useRef(-1);
  const lastNavigationUpdateRef = useRef(0);
  const [viewport, setViewport] = useState<FlatWorldViewport>({
    width: 0,
    height: 0,
    profileId: null
  });
  const [readyCharacter, setReadyCharacter] =
    useState<PlayerCharacter | null>(null);
  const playerReady = readyCharacter === character;
  const [backdropReady, setBackdropReady] = useState(false);
  const [placementReady, setPlacementReady] = useState(false);
  const initialNavigation = useMemo(
    () => createInitialFlatWorldNavigationSnapshot(),
    []
  );
  const initialPlacement = useMemo(
    () =>
      viewport.profileId
        ? calculateRpgReferenceCameraPlacement({
            player: initialNavigation.position,
            profile: viewport.profileId,
            region: initialNavigation.navigationRegion
          })
        : null,
    [initialNavigation, viewport.profileId]
  );
  const initialTransform = useMemo(
    () =>
      viewport.profileId && initialPlacement
        ? resolveRpgReferenceViewportTransform({
            profile: viewport.profileId,
            viewport: { width: viewport.width, height: viewport.height },
            referenceFoot: initialPlacement.playerReferenceProjection.pixel,
            navigationRegion: initialNavigation.navigationRegion,
            revision: 0,
            navigationRevision: initialNavigation.revision
          })
        : null,
    [
      initialNavigation,
      initialPlacement,
      viewport.height,
      viewport.profileId,
      viewport.width
    ]
  );

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const measure = () => {
      const width = renderer.clientWidth;
      const height = renderer.clientHeight;
      const profileId = resolveFlatWorldViewportProfile(width, height);
      renderer.dataset.worldReady = "false";
      renderer.dataset.viewport = `${width},${height}`;
      renderer.dataset.viewportSize = `${width},${height}`;
      renderer.dataset.viewportSupported = String(profileId !== null);
      renderer.dataset.cameraProfile = profileId ?? "unsupported";
      renderer.dataset.cameraStatus =
        width === 0 || height === 0
          ? "awaiting-size"
          : profileId
            ? "initializing"
            : "unsupported-viewport";
      setViewport((current) =>
        current.width === width &&
        current.height === height &&
        current.profileId === profileId
          ? current
          : { width, height, profileId }
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(renderer);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    controllerRef.current = null;
    void loadRpgPlayerSpriteImages(
      getSelectedPlayerRuntimeManifest(character)
    )
      .then((images) => {
        if (cancelled) return;
        controllerRef.current = createRpgPlayerSpriteController(
          character,
          images
        );
        setReadyCharacter(character);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      controllerRef.current = null;
    };
  }, [character]);

  const failClosed = useCallback((reason: string) => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const shadow = shadowRef.current;
    if (!renderer || !canvas) return;
    clearPlayerCanvas(canvas);
    if (shadow) shadow.style.visibility = "hidden";
    renderer.dataset.worldReady = "false";
    writeTelemetry(renderer, canvas, {
      worldRenderer: "approved-reference-canvas2d",
      cameraMode: "reference-image-2d",
      cameraStatus: lastValidFrameRef.current
        ? "holding-last-valid"
        : "invalid",
      cameraStepStatus: reason,
      stepStatus: reason,
      worldReady: "false"
    });
    recoveryPendingRef.current = true;
    setPlacementReady(false);
  }, []);

  useEffect(() => {
    const profileId = viewport.profileId;
    if (!profileId || !initialTransform) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    const tick = (now: number) => {
      const renderer = rendererRef.current;
      const canvas = canvasRef.current;
      const shadow = shadowRef.current;
      const controller = controllerRef.current;
      const composition = compositionRef.current;
      const backdrop = backdropRef.current;
      if (!renderer || !canvas || !shadow || !composition || !backdrop) {
        failClosed("composition-layout-unavailable");
        animationFrame = requestAnimationFrame(tick);
        return;
      }
      const context = canvas.getContext("2d");
      if (!context || !controller || !playerReady || !backdropReady) {
        failClosed(!context ? "canvas2d-unavailable" : "assets-pending");
        animationFrame = requestAnimationFrame(tick);
        return;
      }
      const deltaSeconds = getFlatWorldAdvanceSeconds((now - previousTime) / 1000);
      previousTime = now;
      const session = sessionRef.current;
      const discreteReason = applyRpgReferenceNavigationFrameInput({
        session,
        input,
        screenMovement: screenMovementRef.current,
        worldMovement: worldMovementRef.current,
        movementTelemetry: movementTelemetryRef.current,
        deltaSeconds
      });
      const navigation = session.getNavigationSnapshot();
      const placement = calculateRpgReferenceCameraPlacement({
        player: navigation.position,
        profile: profileId,
        region: navigation.navigationRegion
      });
      const previous = lastValidFrameRef.current;
      const frameChanged =
        previous !== null &&
        (previous.transform.safeFrame.x !== initialTransform.safeFrame.x ||
          previous.transform.safeFrame.y !== initialTransform.safeFrame.y ||
          previous.transform.safeFrame.width !==
            initialTransform.safeFrame.width ||
          previous.transform.safeFrame.height !==
            initialTransform.safeFrame.height);
      const profileChanged =
        lastProfileRef.current !== profileId || frameChanged;
      const updateKind = classifyRpgReferenceFrameUpdate({
        discreteReason,
        profileChanged,
        recoveryPending: recoveryPendingRef.current
      });
      const transform = placement
        ? stepRpgReferenceViewportTransform({
            profile: profileId,
            viewport: { width: viewport.width, height: viewport.height },
            referenceFoot: placement.playerReferenceProjection.pixel,
            navigationRegion: navigation.navigationRegion,
            revision: (previous?.transform.revision ?? -1) + 1,
            navigationRevision: navigation.revision,
            previous:
              previous && lastProfileRef.current === profileId
                ? previous.transform
                : null,
            previousReferenceFoot: previous?.referenceFoot,
            atomic: updateKind !== "ordinary"
          })
        : null;
      const spriteState = controller.applyFrame(
        createFlatWorldPlayerSpriteFrameInput(
          navigation,
          screenMovementRef.current,
          deltaSeconds
        )
      );
      const image = spriteState
        ? controller.images.get(spriteState.frame.asset) ?? null
        : null;
      if (!placement || !transform || !spriteState || !image) {
        failClosed(
          !placement
            ? "placement-null"
            : !transform
              ? "reference-transform-null"
              : "sprite-projection-null"
        );
        animationFrame = requestAnimationFrame(tick);
        return;
      }
      const backdropElement = renderer.querySelector<HTMLElement>(
        '[data-rpg-world-backdrop="approved-image"]'
      );
      if (!backdropElement) {
        failClosed("backdrop-element-unavailable");
        animationFrame = requestAnimationFrame(tick);
        return;
      }
      const screenFoot = projectReferencePointToViewport(
        placement.playerReferenceProjection.pixel,
        transform
      );
      const displayHeight = playerDisplayHeight(
        profileId,
        navigation.currentZoneId
      ) * viewportContentScale(profileId, transform);
      const deviceScale = Math.min(2, window.devicePixelRatio || 1);
      const canvasWidth = Math.round(transform.safeFrame.width * deviceScale);
      const canvasHeight = Math.round(transform.safeFrame.height * deviceScale);
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }
      canvas.style.width = `${transform.safeFrame.width}px`;
      canvas.style.height = `${transform.safeFrame.height}px`;
      applyRpgReferenceLayerTransform(canvas, transform, "player-canvas");
      applyRpgReferenceCanvasFrameTelemetry(canvas, backdropElement, transform);
      const layoutApplied = backdrop.applyTransform(transform);
      const foregroundApplied = composition.applyTransform(
        transform,
        navigation.currentZoneId,
        spriteState.crossing
      );
      if (!layoutApplied || !foregroundApplied) {
        failClosed("composition-transaction-failed");
        animationFrame = requestAnimationFrame(tick);
        return;
      }

      context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
      context.clearRect(
        0,
        0,
        transform.safeFrame.width,
        transform.safeFrame.height
      );
      const playerBounds = drawRpgPlayerSprite(context, image, spriteState, {
        footX: screenFoot[0] - transform.safeFrame.x,
        footY: screenFoot[1] - transform.safeFrame.y,
        displayHeight
      });
      const shadowSpec = shadowContract(profileId, navigation.currentZoneId);
      const contentScale = viewportContentScale(profileId, transform);
      const shadowScale = spriteState.pose.shadowScale;
      const shadowWidth = shadowSpec.width * shadowScale * contentScale;
      const shadowHeight = shadowSpec.height * shadowScale * contentScale;
      applyRpgReferenceLayerTransform(shadow, transform, "player-shadow");
      shadow.style.left = `${screenFoot[0] - shadowWidth / 2}px`;
      shadow.style.top = `${
        screenFoot[1] +
        shadowSpec.footOffset * contentScale -
        shadowHeight / 2
      }px`;
      shadow.style.width = `${shadowWidth}px`;
      shadow.style.height = `${shadowHeight}px`;
      shadow.style.opacity = String(
        shadowSpec.opacity * (spriteState.pose.shadowOpacity / 0.56)
      );
      shadow.style.filter = `blur(${shadowSpec.blur * contentScale}px)`;
      shadow.style.visibility = "visible";
      shadow.dataset.rpgPlayerShadowBounds = [
        screenFoot[0] - shadowWidth / 2,
        screenFoot[1] +
          shadowSpec.footOffset * contentScale -
          shadowHeight / 2,
        shadowWidth,
        shadowHeight
      ].join(",");
      shadow.dataset.rpgPlayerShadowBlur = String(
        shadowSpec.blur * contentScale
      );
      shadow.dataset.rpgPlayerShadowFootOffset = String(
        shadowSpec.footOffset * contentScale
      );
      shadow.dataset.rpgPlayerShadowColor = "#07101d";
      writeRpgPlayerSpriteTelemetry(
        canvas,
        character,
        spriteState,
        true
      );
      const foregroundElement = renderer.querySelector<HTMLElement>(
        '[data-rpg-reference-layer="foreground-frame"]'
      );
      const identity = `${transform.navigationRevision}:${transform.revision}`;
      const transactionElements = [
        backdropElement,
        canvas,
        shadow,
        foregroundElement
      ];
      const transactionConsistent = transactionElements.every(
        (element) =>
          element?.dataset.rpgReferenceTransformIdentity === identity
      );
      const actualBackdropReady =
        backdropElement.dataset.rpgWorldBackdropReady === "true";
      const worldReady =
        actualBackdropReady &&
        transactionConsistent &&
        playerReady &&
        layoutApplied &&
        foregroundApplied;
      const screenBounds = {
        minimumX: playerBounds.left + transform.safeFrame.x,
        maximumX:
          playerBounds.left + playerBounds.width + transform.safeFrame.x,
        minimumY: playerBounds.top + transform.safeFrame.y,
        maximumY:
          playerBounds.top + playerBounds.height + transform.safeFrame.y
      };
      const previousFoot = previous
        ? projectReferencePointToViewport(previous.referenceFoot, previous.transform)
        : null;
      const playerFootStep = previousFoot
        ? Math.hypot(screenFoot[0] - previousFoot[0], screenFoot[1] - previousFoot[1])
        : 0;
      const referenceBounds = placement.playerReferenceBounds;
      const screenReferenceBounds = {
        minimumX:
          transform.safeFrame.x +
          (referenceBounds.minimumX - transform.sourceOffsetX) *
            transform.scale,
        maximumX:
          transform.safeFrame.x +
          (referenceBounds.maximumX - transform.sourceOffsetX) *
            transform.scale,
        minimumY:
          transform.safeFrame.y +
          (referenceBounds.minimumY - transform.sourceOffsetY) *
            transform.scale,
        maximumY:
          transform.safeFrame.y +
          (referenceBounds.maximumY - transform.sourceOffsetY) *
            transform.scale
      };
      const formatBounds = (bounds: typeof referenceBounds) =>
        [
          bounds.minimumX,
          bounds.minimumY,
          bounds.maximumX,
          bounds.maximumY
        ].join(",");
      writeTelemetry(renderer, canvas, {
        worldRenderer: "approved-reference",
        rendererTechnology: "canvas2d",
        cameraMode: "orthographic-reference",
        cameraStatus: "valid",
        cameraStepStatus:
          updateKind === "ordinary" ? "tracking" : `reinitialized-${updateKind}`,
        stepStatus:
          updateKind === "ordinary" ? "tracking" : `reinitialized-${updateKind}`,
        cameraProfile: profileId,
        profile: profileId,
        viewport: `${viewport.width},${viewport.height}`,
        viewportSize: `${viewport.width},${viewport.height}`,
        viewportSupported: "true",
        safeFrame: [
          transform.safeFrame.x,
          transform.safeFrame.y,
          transform.safeFrame.width,
          transform.safeFrame.height
        ].join(","),
        backdropScale: transform.scale.toFixed(9),
        sourceOffset: transform.sourceOffsetX.toFixed(6),
        targetSourceOffset: transform.sourceOffsetX.toFixed(6),
        sourceWindow: [
          transform.sourceOffsetX,
          transform.sourceOffsetY,
          transform.sourceOffsetX +
            transform.safeFrame.width / transform.scale,
          transform.sourceOffsetY +
            transform.safeFrame.height / transform.scale
        ].join(","),
        referenceImageFrame: [
          transform.imageFrame.x,
          transform.imageFrame.y,
          transform.imageFrame.width,
          transform.imageFrame.height
        ].join(","),
        cameraStepCssPixels: previous
          ? Math.max(
              Math.abs(
                transform.imageFrame.x - previous.transform.imageFrame.x
              ),
              Math.abs(
                transform.imageFrame.y - previous.transform.imageFrame.y
              )
            ).toFixed(6)
          : "0.000000",
        referenceTransformRevision: String(transform.revision),
        referenceNavigationRevision: String(transform.navigationRevision),
        referenceTransformIdentity: identity,
        referenceTransformTelemetryConsistent: String(transactionConsistent),
        referenceFrameUpdateKind: updateKind,
        referenceFrameAtomic: String(updateKind !== "ordinary"),
        playerFootStepCssPixels: playerFootStep.toFixed(6),
        playerReferencePixel: placement.playerReferenceProjection.pixel
          .map((value) => value.toFixed(4))
          .join(","),
        playerRawReferencePixel: placement.playerReferenceProjection.pixel
          .map((value) => value.toFixed(6))
          .join(","),
        playerRawDepthKey:
          placement.playerReferenceProjection.depthKey.toFixed(6),
        playerRendererLocalCorrection: "none",
        playerGrounded: String(navigation.grounded),
        playerScreenFoot: screenFoot.map((value) => value.toFixed(4)).join(","),
        playerScreenBounds: [
          screenBounds.minimumX,
          screenBounds.minimumY,
          screenBounds.maximumX,
          screenBounds.maximumY
        ].join(","),
        playerReferenceBounds: formatBounds(referenceBounds),
        playerActualReferenceBounds: formatBounds(referenceBounds),
        playerCameraScreenBounds: formatBounds(screenReferenceBounds),
        playerScreenHeight: displayHeight.toFixed(6),
        playerDisplayCssHeight: displayHeight.toFixed(6),
        playerDisplayProfile: profileId,
        playerAlphaBottomFootDelta: String(
          Math.abs(
            playerBounds.top +
              playerBounds.height -
              (screenFoot[1] - transform.safeFrame.y)
          )
        ),
        movementFallback: String(
          movementTelemetryRef.current.usedCompatibilityWorldPosition
        ),
        movementCompatibility: String(
          movementTelemetryRef.current.usedCompatibilityWorldPosition
        ),
        navigationRegion: navigation.navigationRegionId,
        transitionProgress:
          navigation.transitionProgress === null
            ? ""
            : navigation.transitionProgress.toFixed(6),
        activeDepthBand: spriteState.activeBand ?? "none",
        depthCrossing: spriteState.crossing ?? "none",
        characterDepth: spriteState.projection.depthKey.toFixed(6),
        foregroundCrossing:
          foregroundElement?.dataset.rpgReferenceForegroundCrossing ?? "none",
        foregroundVisible:
          foregroundElement?.dataset.rpgReferenceForegroundVisible ?? "false",
        foregroundAbovePlayer:
          foregroundElement?.dataset.rpgReferenceForegroundAbovePlayer ??
          "false",
        foregroundId:
          foregroundElement?.dataset.rpgReferenceForegroundMask ?? "none",
        foregroundImageCount: "1",
        foregroundSourceCount: "1",
        characterId: character,
        characterAsset: spriteState.frame.asset,
        runtimeAsset: spriteState.frame.asset,
        backdropReady: String(actualBackdropReady),
        backdropImageCount: "1",
        characterReady: "true",
        characterReadiness: "ready",
        worldReady: String(worldReady),
        moving: String(navigation.moving),
        activeDestinationId: activeDestinationId ?? ""
      });
      renderer.dataset.worldReady = String(worldReady);
      setPlacementReady((current) => current || worldReady);
      lastValidFrameRef.current = {
        navigation,
        transform,
        referenceFoot: placement.playerReferenceProjection.pixel
      };
      lastProfileRef.current = profileId;
      recoveryPendingRef.current = false;
      if (
        navigation.revision !== lastNavigationRevisionRef.current &&
        (discreteReason !== null ||
          now - lastNavigationUpdateRef.current >= 200)
      ) {
        lastNavigationRevisionRef.current = navigation.revision;
        lastNavigationUpdateRef.current = now;
        onNavigationChange(adaptFlatWorldNavigationSnapshot(navigation));
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    backdropReady,
    failClosed,
    initialTransform,
    playerReady,
    activeDestinationId,
    character,
    input,
    onNavigationChange,
    viewport
  ]);

  const worldReady =
    viewport.profileId !== null &&
    placementReady &&
    playerReady &&
    backdropReady;

  return (
    <div
      ref={rendererRef}
      className="flat-world-renderer"
      data-world-ready={String(worldReady)}
      data-world-renderer="approved-reference"
      data-renderer-technology="canvas2d"
      data-camera-mode="orthographic-reference"
      data-camera-profile={viewport.profileId ?? "unsupported"}
      data-profile={viewport.profileId ?? "unsupported"}
      data-viewport={`${viewport.width},${viewport.height}`}
      data-viewport-supported={String(viewport.profileId !== null)}
      data-backdrop-ready={String(backdropReady)}
      data-character-ready={String(playerReady)}
      data-character-id={character}
      data-character-readiness={playerReady ? "ready" : "loading"}
      data-movement-compatibility="false"
    >
      {initialPlacement && initialTransform ? (
        <>
          <RpgWorldBackdrop
            ref={backdropRef}
            sourceOffset={initialTransform.sourceOffsetX}
            backdropScale={initialTransform.scale}
            safeFrame={initialTransform.safeFrame}
            sharedTransform={initialTransform}
            onReadyChange={setBackdropReady}
            style={{ zIndex: 0 }}
          />
          <div
            ref={shadowRef}
            aria-hidden="true"
            data-rpg-reference-layer="player-shadow"
            data-rpg-player-shadow="approved-contract"
            style={{
              position: "absolute",
              zIndex: 1,
              borderRadius: "50%",
              background: "#07101d",
              opacity: 0,
              visibility: "hidden",
              pointerEvents: "none"
            }}
          />
          <canvas
            ref={canvasRef}
            className="world-canvas"
            aria-hidden="true"
            data-rpg-reference-layer="player-canvas"
            data-player-canvas="canvas2d"
            style={{
              position: "absolute",
              zIndex: 2,
              background: "transparent",
              pointerEvents: "none"
            }}
          />
          <RpgReferenceSceneComposition
            ref={compositionRef}
            transform={initialTransform}
            zoneId={initialNavigation.currentZoneId}
            style={{ zIndex: 3 }}
          />
        </>
      ) : null}
    </div>
  );
}

export default memo(FlatWorldCanvas);
