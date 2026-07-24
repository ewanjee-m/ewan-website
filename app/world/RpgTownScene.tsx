"use client";

import { memo, type RefObject, useRef } from "react";
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
  npcCrowd: false
} as const;

export function resolveRpgTownSceneRenderContract() {
  return RPG_TOWN_SCENE_RENDER_CONTRACT;
}

export const RpgTownScene = memo(function RpgTownScene({
  qualityLevel = "high",
  navigation
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
      <RpgWorldEffects
        qualityLevel={qualityLevel}
        presentation={presentation}
      />
      <RpgRegionAudio presentation={presentation} />
    </group>
  );
});
