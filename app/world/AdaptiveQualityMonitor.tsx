"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import {
  createAdaptiveQuality,
  type RpgQualityDegradationStage
} from "./AdaptiveQuality";
import {
  getSceneQuality,
  type SceneQualityLevel,
  type SceneQualitySettings
} from "./SceneQuality";

export interface AdaptiveQualityMonitorProps {
  initialLevel: SceneQualityLevel;
  reducedMotion: boolean;
  coarsePointer: boolean;
  onSettingsChange: (settings: SceneQualitySettings) => void;
}

export function AdaptiveQualityMonitor({
  initialLevel,
  reducedMotion,
  coarsePointer,
  onSettingsChange
}: AdaptiveQualityMonitorProps) {
  const adaptive = useRef(createAdaptiveQuality({ initialLevel }));
  const lastStage = useRef<RpgQualityDegradationStage>("full");

  useFrame((_, delta) => {
    adaptive.current.recordFrame(delta);
    const nextStage = adaptive.current.getStage();
    if (nextStage !== lastStage.current) {
      lastStage.current = nextStage;
      onSettingsChange(
        getSceneQuality({
          level: initialLevel,
          reducedMotion,
          degradationStage: nextStage,
          coarsePointer
        })
      );
    }
  });

  return null;
}
