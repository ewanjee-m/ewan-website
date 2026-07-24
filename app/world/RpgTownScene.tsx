"use client";

import { memo, type RefObject, useRef } from "react";
import { Vector3 } from "three";
import { RpgAirportBusActor } from "./RpgAirportBusActor";
import type { RpgBusRuntime } from "./RpgBusRuntime";
import type { RpgCameraDynamicObstacle } from "./RpgCameraCollision";
import { RpgNpcCrowd } from "./RpgNpcCrowd";
import { RpgRegionAudio } from "./RpgRegionAudio";
import { createRpgRegionPresentation } from "./RpgRegionPresentation";
import { RpgSignatureLandmarks } from "./RpgSignatureLandmarks";
import { RpgTownAmbience } from "./RpgTownAmbience";
import { RpgTownArchitecture } from "./RpgTownArchitecture";
import { RpgTownDetails } from "./RpgTownDetails";
import { RpgWorldEffects } from "./RpgWorldEffects";
import { RpgWorldSurfaces } from "./RpgWorldSurfaces";
import type { SceneQualityLevel } from "./SceneQuality";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export interface RpgTownSceneProps {
  readonly qualityLevel?: SceneQualityLevel;
  readonly navigation: RefObject<WorldNavigationSnapshot>;
  readonly playerPosition: RefObject<Vector3>;
  readonly dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  readonly busRuntime: RpgBusRuntime;
  readonly reducedMotion: boolean;
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
  qualityLevel = "high",
  navigation,
  playerPosition,
  dynamicObstacles,
  busRuntime,
  reducedMotion
}: RpgTownSceneProps) {
  const presentation = useRef(createRpgRegionPresentation());
  return (
    <group name="seamless-rpg-town">
      <RpgTownAmbience
        qualityLevel={qualityLevel}
        navigation={navigation}
        presentation={presentation}
      />
      <RpgWorldSurfaces />
      <RpgTownArchitecture qualityLevel={qualityLevel} />
      <RpgTownDetails presentation={presentation} />
      <RpgSignatureLandmarks
        qualityLevel={qualityLevel}
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
      />
      <RpgWorldEffects
        qualityLevel={qualityLevel}
        presentation={presentation}
      />
      <RpgRegionAudio presentation={presentation} />
    </group>
  );
});
