"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { createAdaptiveQuality } from "./AdaptiveQuality";
import type { SceneQualityLevel } from "./SceneQuality";

export interface AdaptiveQualityMonitorProps {
  initialLevel: SceneQualityLevel;
  onLevelChange: (level: SceneQualityLevel) => void;
}

export function AdaptiveQualityMonitor({
  initialLevel,
  onLevelChange
}: AdaptiveQualityMonitorProps) {
  const adaptive = useRef(createAdaptiveQuality({ initialLevel }));
  const lastLevel = useRef(initialLevel);

  useFrame((_, delta) => {
    const next = adaptive.current.recordFrame(delta);
    if (next !== lastLevel.current) {
      lastLevel.current = next;
      onLevelChange(next);
    }
  });

  return null;
}
