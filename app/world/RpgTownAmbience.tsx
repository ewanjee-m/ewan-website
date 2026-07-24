"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import {
  Color,
  type DirectionalLight,
  type Fog,
  type HemisphereLight,
  MathUtils
} from "three";
import type { RpgRegionPresentationState } from "./RpgRegionPresentation";
import { resolveRpgRegionPresentation } from "./RpgRegionPresentation";
import type { SceneQualitySettings } from "./SceneQuality";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export interface RpgTownAmbienceProps {
  readonly qualitySettings: SceneQualitySettings;
  readonly navigation: RefObject<WorldNavigationSnapshot>;
  readonly presentation: RefObject<RpgRegionPresentationState>;
}

export function RpgTownAmbience({
  qualitySettings,
  navigation,
  presentation
}: RpgTownAmbienceProps) {
  const background = useRef<Color>(null);
  const fog = useRef<Fog>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const directional = useRef<DirectionalLight>(null);
  const shadowFrame = useRef(0);

  useFrame((_, delta) => {
    const target = resolveRpgRegionPresentation(
      navigation.current.navigationRegion,
      presentation.current
    );
    const colorAmount = 1 - Math.exp(-delta * 5);
    background.current?.lerp(target.sky, colorAmount);
    fog.current?.color.lerp(target.fog, colorAmount);
    if (hemisphere.current) {
      hemisphere.current.color.lerp(target.fill, colorAmount);
      hemisphere.current.groundColor.lerp(target.fog, colorAmount);
      hemisphere.current.intensity = MathUtils.damp(
        hemisphere.current.intensity,
        target.fillIntensity,
        5,
        delta
      );
    }
    if (directional.current) {
      directional.current.color.lerp(target.key, colorAmount);
      directional.current.intensity = MathUtils.damp(
        directional.current.intensity,
        qualitySettings.level === "low"
          ? target.keyIntensity * 0.78
          : target.keyIntensity,
        5,
        delta
      );
      shadowFrame.current += 1;
      directional.current.shadow.autoUpdate =
        qualitySettings.shadowUpdateEveryFrames === 1;
      if (
        qualitySettings.shadowUpdateEveryFrames > 1 &&
        shadowFrame.current % qualitySettings.shadowUpdateEveryFrames === 0
      ) {
        directional.current.shadow.needsUpdate = true;
      }
    }
  }, -3);

  return (
    <>
      <color ref={background} attach="background" args={["#b9dff0"]} />
      <fog ref={fog} attach="fog" args={["#d7e3e5", 34, 98]} />
      <hemisphereLight
        ref={hemisphere}
        color="#b5dcf0"
        groundColor="#d7e3e5"
        intensity={0.8}
      />
      <directionalLight
        ref={directional}
        color="#fff6df"
        intensity={1.25}
        position={[-22, 34, 18]}
        castShadow={qualitySettings.shadowMapSize > 0}
        shadow-mapSize-width={qualitySettings.shadowMapSize}
        shadow-mapSize-height={qualitySettings.shadowMapSize}
      />
    </>
  );
}
