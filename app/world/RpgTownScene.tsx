"use client";

import { memo, type RefObject, useEffect, useRef } from "react";
import { Vector3 } from "three";
import { RpgAirportBusActor } from "./RpgAirportBusActor";
import type { RpgBusRuntime } from "./RpgBusRuntime";
import type { RpgCameraDynamicObstacle } from "./RpgCameraCollision";
import { RpgNpcCrowd } from "./RpgNpcCrowd";
import { RpgOptionalDecoration } from "./RpgOptionalDecoration";
import { RpgRegionAudio } from "./RpgRegionAudio";
import { createRpgRegionPresentation } from "./RpgRegionPresentation";
import { markRpgRuntimeDiagnostic } from "./RpgRuntimeDiagnostics";
import { RpgSignatureLandmarks } from "./RpgSignatureLandmarks";
import { RpgTownAmbience } from "./RpgTownAmbience";
import { RpgTownArchitecture } from "./RpgTownArchitecture";
import { RpgTownDetails } from "./RpgTownDetails";
import { RpgWorldEffects } from "./RpgWorldEffects";
import { RpgWorldSurfaces } from "./RpgWorldSurfaces";
import type { SceneQualitySettings } from "./SceneQuality";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import type { WorldRuntime } from "./WorldRuntime";

export interface RpgTownSceneProps {
  readonly qualitySettings: SceneQualitySettings;
  readonly navigation: RefObject<WorldNavigationSnapshot>;
  readonly playerPosition: RefObject<Vector3>;
  readonly dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  readonly busRuntime: RpgBusRuntime;
  readonly reducedMotion: boolean;
  readonly runtime: WorldRuntime;
  readonly telemetry: RefObject<HTMLDivElement | null>;
}

export interface RpgTownSceneRenderContract {
  readonly renderer: "seamless-rpg";
  readonly technology: "webgl3d";
  readonly ground: boolean;
  readonly roads: boolean;
  readonly canal: boolean;
  readonly bridge: boolean;
  readonly buildings: boolean;
  readonly signatureLandmarks: boolean;
  readonly npcCrowd: boolean;
}

export const RPG_TOWN_SCENE_RENDER_CONTRACT: RpgTownSceneRenderContract = {
  renderer: "seamless-rpg",
  technology: "webgl3d",
  ground: true,
  roads: true,
  canal: true,
  bridge: true,
  buildings: true,
  signatureLandmarks: true,
  npcCrowd: true
} as const;

export function resolveRpgTownSceneRenderContract() {
  return RPG_TOWN_SCENE_RENDER_CONTRACT;
}

export const RpgTownScene = memo(function RpgTownScene({
  qualitySettings,
  navigation,
  playerPosition,
  dynamicObstacles,
  busRuntime,
  reducedMotion,
  runtime,
  telemetry
}: RpgTownSceneProps) {
  const presentation = useRef(createRpgRegionPresentation());
  useEffect(() => {
    markRpgRuntimeDiagnostic("sceneMounts");
  }, []);

  return (
    <>
      <RpgTownAmbience
        qualitySettings={qualitySettings}
        navigation={navigation}
        presentation={presentation}
      />
      <group name="seamless-rpg-town">
        <RpgWorldSurfaces />
        <RpgTownArchitecture qualityLevel={qualitySettings.level} />
        <RpgTownDetails
          qualitySettings={qualitySettings}
          presentation={presentation}
          playerPosition={playerPosition}
        />
        <RpgSignatureLandmarks
          qualitySettings={qualitySettings}
          presentation={presentation}
        />
        <RpgAirportBusActor
          runtime={busRuntime}
          dynamicObstacles={dynamicObstacles}
          reducedMotion={reducedMotion}
        />
        <RpgNpcCrowd
          playerPosition={playerPosition}
          dynamicObstacles={dynamicObstacles}
          reducedMotion={reducedMotion}
          npcSecondaryMotion={qualitySettings.npcSecondaryMotion}
          runtime={runtime}
          telemetry={telemetry}
        />
        <RpgWorldEffects
          qualitySettings={qualitySettings}
          presentation={presentation}
        />
        <RpgOptionalDecoration telemetry={telemetry} />
        <RpgRegionAudio presentation={presentation} />
      </group>
    </>
  );
});
