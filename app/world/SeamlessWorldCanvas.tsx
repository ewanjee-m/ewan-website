"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  Suspense,
  type ComponentType,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import { NeutralToneMapping, Vector3 } from "three";
import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_TONE_MAPPING_EXPOSURE,
  RPG_WORLD_CAMERA_FAR
} from "./RpgLightingDesign";
import { AdaptiveQualityMonitor } from "./AdaptiveQualityMonitor";
import type { PlayerCharacterId } from "./CharacterAssets";
import { ChaseOrbitCamera3d } from "./ChaseOrbitCamera3d";
import type { InputController } from "./InputController";
import { RpgPlayerActor } from "./RpgPlayerActor";
import { getRpgPlayerCharacterDesign } from "./RpgPlayerCharacterDesign";
import { createRpgBusRuntime } from "./RpgBusRuntime";
import type { RpgCameraDynamicObstacle } from "./RpgCameraCollision";
import { markRpgRuntimeDiagnostic } from "./RpgRuntimeDiagnostics";
import { RpgSceneRuntime } from "./RpgSceneRuntime";
import { isRpgPositionOutsideMovingBus } from "./RpgBusMotion";
import { RpgTownScene } from "./RpgTownScene";
import type { RpgTownSceneProps } from "./RpgTownScene";
import {
  detectBrowserSceneQualityLevel,
  getSceneQuality,
  type SceneQualitySettings
} from "./SceneQuality";
import { supportsWebGl } from "./WorldCapability";
import { createWorldBootstrap } from "./WorldBootstrap";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import {
  createWorldRuntime,
  type WorldRuntime
} from "./WorldRuntime";
import type { WorldInteractionEntryId } from "./WorldInteraction";
import {
  WorldPerformanceMonitor,
  type WorldPerformanceTelemetry
} from "./WorldPerformanceMonitor";
import type { WorldPerformanceSample } from "./WorldPerformanceSampler";

export interface SeamlessWorldDependencies {
  readonly createRuntime: typeof createWorldRuntime;
  readonly SceneComponent: ComponentType<RpgTownSceneProps>;
  readonly supportsWebGl: typeof supportsWebGl;
}

export const DEFAULT_SEAMLESS_WORLD_DEPENDENCIES:
  SeamlessWorldDependencies = Object.freeze({
    createRuntime: createWorldRuntime,
    SceneComponent: RpgTownScene,
    supportsWebGl
  });

export interface SeamlessWorldCanvasProps {
  character: PlayerCharacterId;
  input: InputController;
  activeDestinationId: DestinationId | null;
  inputLocked: boolean;
  onInteractionRequest: (entryId: WorldInteractionEntryId) => void;
  onNavigationChange: (snapshot: WorldNavigationSnapshot) => void;
  onRetry: () => void;
  dependencies?: Partial<SeamlessWorldDependencies>;
}

function WorldReadyMarker({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const emitted = useRef(false);

  useFrame(() => {
    frames.current += 1;
    if (!emitted.current && frames.current >= 2) {
      emitted.current = true;
      onReady();
    }
  });

  return null;
}

interface SupportedSeamlessWorldCanvasProps extends SeamlessWorldCanvasProps {
  readonly createRuntimeDependency: typeof createWorldRuntime;
  readonly SceneComponent: ComponentType<RpgTownSceneProps>;
}

function SeamlessWorldContents({
  runtime,
  busRuntime,
  SceneComponent,
  qualitySettings,
  reducedMotion,
  coarsePointer,
  qualityLevel,
  telemetry,
  onSettingsChange,
  onPerformanceSample,
  onReady,
  worldReady,
  ...props
}: SeamlessWorldCanvasProps & {
  readonly runtime: WorldRuntime;
  readonly busRuntime: ReturnType<typeof createRpgBusRuntime>;
  readonly SceneComponent: ComponentType<RpgTownSceneProps>;
  readonly qualitySettings: SceneQualitySettings;
  readonly reducedMotion: boolean;
  readonly coarsePointer: boolean;
  readonly qualityLevel: SceneQualitySettings["level"];
  readonly telemetry: RefObject<HTMLDivElement | null>;
  readonly onSettingsChange: (settings: SceneQualitySettings) => void;
  readonly onPerformanceSample: (
    sample: Readonly<WorldPerformanceSample>
  ) => void;
  readonly onReady: () => void;
  readonly worldReady: boolean;
}) {
  const initialNavigation = useMemo(
    () => runtime.getNavigationSnapshot(),
    [runtime]
  );
  const navigation = useRef(initialNavigation);
  const playerPosition = useRef(
    new Vector3(...initialNavigation.position)
  );
  const dynamicObstacles = useRef(
    new Map<string, RpgCameraDynamicObstacle>()
  );

  return (
    <>
      <SceneComponent
        qualitySettings={qualitySettings}
        navigation={navigation}
        playerPosition={playerPosition}
        dynamicObstacles={dynamicObstacles}
        busRuntime={busRuntime}
        reducedMotion={reducedMotion}
        runtime={runtime}
        telemetry={telemetry}
      />
      <RpgPlayerActor
        character={props.character}
        navigation={navigation}
        playerPosition={playerPosition}
        qualitySettings={qualitySettings}
        reducedMotion={reducedMotion}
        telemetry={telemetry}
      />
      <RpgSceneRuntime
        runtime={runtime}
        input={props.input}
        inputLocked={props.inputLocked || !worldReady}
        navigation={navigation}
        onNavigationChange={props.onNavigationChange}
        onInteractionRequest={props.onInteractionRequest}
        telemetry={telemetry}
      />
      <ChaseOrbitCamera3d
        runtime={runtime}
        input={props.input}
        inputLocked={props.inputLocked || !worldReady}
        navigation={navigation}
        playerPosition={playerPosition}
        playerVisibleHeight={
          getRpgPlayerCharacterDesign(props.character).height
        }
        dynamicObstacles={dynamicObstacles}
        telemetry={telemetry}
      />
      <AdaptiveQualityMonitor
        initialLevel={qualityLevel}
        reducedMotion={reducedMotion}
        coarsePointer={coarsePointer}
        onSettingsChange={onSettingsChange}
      />
      <WorldPerformanceMonitor onSample={onPerformanceSample} />
      <WorldReadyMarker onReady={onReady} />
    </>
  );
}

function SupportedSeamlessWorldCanvas({
  createRuntimeDependency,
  SceneComponent,
  ...props
}: SupportedSeamlessWorldCanvasProps) {
  useEffect(() => {
    markRpgRuntimeDiagnostic("canvasMounts");
  }, []);

  const busRuntime = useMemo(() => createRpgBusRuntime(), []);
  const [runtime, setRuntime] = useState<WorldRuntime | null>(null);
  const telemetry = useRef<HTMLDivElement>(null);
  const [worldReady, setWorldReady] = useState(false);
  const reducedMotion = useMemo(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const qualityLevel = useMemo(
    () => detectBrowserSceneQualityLevel(),
    []
  );
  const coarsePointer = useMemo(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
    []
  );
  const [qualitySettings, setQualitySettings] = useState(() =>
    getSceneQuality({
      level: qualityLevel,
      reducedMotion,
      degradationStage: "full",
      coarsePointer
    })
  );
  const qualityStage = useRef(qualitySettings.degradationStage);
  const latestPerformanceSample =
    useRef<Readonly<WorldPerformanceSample> | null>(null);
  const markReady = useCallback(() => {
    props.input.reset();
    setWorldReady(true);
  }, [props.input]);
  const publishPerformance = useCallback(
    (sample: Readonly<WorldPerformanceSample>) => {
      latestPerformanceSample.current = sample;
      const telemetryRecord = Object.freeze({
        ...sample,
        qualityStage: qualityStage.current
      }) satisfies Readonly<WorldPerformanceTelemetry>;
      window.__RPG_PERFORMANCE__ = telemetryRecord;
      telemetry.current?.setAttribute(
        "data-average-fps",
        sample.averageFps.toFixed(2)
      );
      telemetry.current?.setAttribute(
        "data-p5-fps",
        sample.p5Fps.toFixed(2)
      );
      telemetry.current?.setAttribute(
        "data-long-frame-count",
        String(sample.longFrameCount)
      );
    },
    []
  );

  useEffect(() => {
    props.input.reset();
    delete window.__RPG_PERFORMANCE__;
    return () => {
      delete window.__RPG_PERFORMANCE__;
    };
  }, [props.input]);

  useEffect(() => {
    let active = true;
    markRpgRuntimeDiagnostic("runtimeCreates");
    const bootstrap = createWorldBootstrap({
      createRuntime: () =>
        createRuntimeDependency({
          canOccupyDynamic: ([x, z]) =>
            isRpgPositionOutsideMovingBus(x, z, busRuntime.pose)
        })
    });
    queueMicrotask(() => {
      if (active) setRuntime(bootstrap.runtime);
    });
    return () => {
      active = false;
    };
  }, [busRuntime, createRuntimeDependency]);

  useEffect(() => {
    const nextStage = qualitySettings.degradationStage;
    qualityStage.current = nextStage;
    telemetry.current?.setAttribute("data-quality-stage", nextStage);
    const sample = latestPerformanceSample.current;
    if (sample) {
      window.__RPG_PERFORMANCE__ = Object.freeze({
        ...sample,
        qualityStage: nextStage
      });
    }
  }, [qualitySettings.degradationStage]);

  return (
    <div
      ref={telemetry}
      className="seamless-world-renderer"
      data-world-renderer="seamless-rpg"
      data-renderer-technology="webgl3d"
      data-world-ready={String(worldReady)}
      data-active-destination={props.activeDestinationId ?? ""}
      data-quality-stage={qualitySettings.degradationStage}
      data-character-fallback="false"
      data-unavailable-npc-ids=""
      data-optional-decoration="pending"
      data-hanabi-fireworks="true"
    >
      {!worldReady ? (
        <div className="world-canvas-loading" role="status">
          Loading 3D world
        </div>
      ) : null}
      <Canvas
        className="world-canvas"
        // near 0.5 is a fifth of RPG_CAMERA_MINIMUM_BOOM_DISTANCE (2.6) and
        // buys roughly five times the depth precision, which is what keeps the
        // stacked ground layers from z-fighting.
        camera={{
          position: [0, 6, 8],
          fov: 45,
          near: 0.5,
          far: RPG_WORLD_CAMERA_FAR
        }}
        dpr={[qualitySettings.minDpr, qualitySettings.maxDpr]}
        shadows={qualitySettings.shadowMapSize > 0}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          // ACES rolls the midtones off and desaturates an already low-chroma
          // palette into grey. Khronos PBR Neutral holds the authored hues.
          toneMapping: NeutralToneMapping,
          toneMappingExposure: RPG_TONE_MAPPING_EXPOSURE
        }}
      >
        <Suspense fallback={null}>
          {runtime ? (
            <SeamlessWorldContents
              {...props}
              runtime={runtime}
              busRuntime={busRuntime}
              SceneComponent={SceneComponent}
            qualitySettings={qualitySettings}
              reducedMotion={reducedMotion}
              coarsePointer={coarsePointer}
              qualityLevel={qualityLevel}
              telemetry={telemetry}
              onSettingsChange={setQualitySettings}
              onPerformanceSample={publishPerformance}
              onReady={markReady}
              worldReady={worldReady}
            />
          ) : null}
        </Suspense>
      </Canvas>
    </div>
  );
}

function SeamlessWorldCanvas(props: SeamlessWorldCanvasProps) {
  const createRuntimeDependency =
    props.dependencies?.createRuntime ??
    DEFAULT_SEAMLESS_WORLD_DEPENDENCIES.createRuntime;
  const SceneComponent =
    props.dependencies?.SceneComponent ??
    DEFAULT_SEAMLESS_WORLD_DEPENDENCIES.SceneComponent;
  const supportsWebGlDependency =
    props.dependencies?.supportsWebGl ??
    DEFAULT_SEAMLESS_WORLD_DEPENDENCIES.supportsWebGl;
  const supported = useMemo(
    () => supportsWebGlDependency(),
    [supportsWebGlDependency]
  );
  useEffect(() => {
    if (!supported) delete window.__RPG_PERFORMANCE__;
  }, [supported]);

  if (!supported) {
    return (
      <div className="world-fallback world-webgl-unsupported" role="status">
        <p>This 3D world requires WebGL support.</p>
        <button type="button" onClick={props.onRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <SupportedSeamlessWorldCanvas
      {...props}
      createRuntimeDependency={createRuntimeDependency}
      SceneComponent={SceneComponent}
    />
  );
}

export default memo(SeamlessWorldCanvas);
