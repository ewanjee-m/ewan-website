"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Vector3 } from "three";
import type { DestinationId } from "../guide/GuideContract";
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
import {
  detectBrowserSceneQualityLevel,
  getSceneCanvasDpr,
  type SceneQualityLevel
} from "./SceneQuality";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import { createWorldRuntime } from "./WorldRuntime";

export interface SeamlessWorldCanvasProps {
  character: PlayerCharacterId;
  input: InputController;
  activeDestinationId: DestinationId | null;
  onNavigationChange: (snapshot: WorldNavigationSnapshot) => void;
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

function SeamlessWorldCanvas(props: SeamlessWorldCanvasProps) {
  useEffect(() => {
    markRpgRuntimeDiagnostic("canvasMounts");
  }, []);

  const busRuntime = useMemo(() => createRpgBusRuntime(), []);
  const runtime = useMemo(() => {
    markRpgRuntimeDiagnostic("runtimeCreates");
    return createWorldRuntime({
      canOccupyDynamic: ([x, z]) =>
        isRpgPositionOutsideMovingBus(x, z, busRuntime.pose)
    });
  }, [busRuntime]);
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
  const telemetry = useRef<HTMLDivElement>(null);
  const initialQualityLevel = useMemo(
    () => detectBrowserSceneQualityLevel(),
    []
  );
  const [qualityLevel, setQualityLevel] =
    useState<SceneQualityLevel>(initialQualityLevel);
  const [worldReady, setWorldReady] = useState(false);
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const markReady = useCallback(() => setWorldReady(true), []);

  return (
    <div
      ref={telemetry}
      className="seamless-world-renderer"
      data-world-renderer="seamless-rpg"
      data-renderer-technology="webgl3d"
      data-world-ready={String(worldReady)}
      data-active-destination={props.activeDestinationId ?? ""}
    >
      {!worldReady ? (
        <div className="world-canvas-loading" role="status">
          Loading 3D world
        </div>
      ) : null}
      <Canvas
        className="world-canvas"
        camera={{ position: [0, 6, 8], fov: 45, near: 0.1, far: 140 }}
        dpr={getSceneCanvasDpr(qualityLevel)}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance"
        }}
      >
        <Suspense fallback={null}>
          <RpgTownScene
            qualityLevel={qualityLevel}
            navigation={navigation}
            playerPosition={playerPosition}
            dynamicObstacles={dynamicObstacles}
            busRuntime={busRuntime}
            reducedMotion={reducedMotion}
          />
          <RpgPlayerActor
            character={props.character}
            navigation={navigation}
            playerPosition={playerPosition}
            qualityLevel={qualityLevel}
            reducedMotion={reducedMotion}
          />
          <RpgSceneRuntime
            runtime={runtime}
            input={props.input}
            navigation={navigation}
            onNavigationChange={props.onNavigationChange}
            telemetry={telemetry}
          />
          <ChaseOrbitCamera3d
            runtime={runtime}
            input={props.input}
            navigation={navigation}
            playerPosition={playerPosition}
            playerVisibleHeight={
              getRpgPlayerCharacterDesign(props.character).height
            }
            dynamicObstacles={dynamicObstacles}
            telemetry={telemetry}
          />
          <AdaptiveQualityMonitor
            initialLevel={initialQualityLevel}
            onLevelChange={setQualityLevel}
          />
          <WorldReadyMarker onReady={markReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default memo(SeamlessWorldCanvas);
