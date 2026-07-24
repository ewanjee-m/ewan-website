"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { RpgQualityDegradationStage } from "./AdaptiveQuality";
import {
  createWorldPerformanceSampler,
  type WorldPerformanceSample
} from "./WorldPerformanceSampler";

export interface WorldPerformanceTelemetry extends WorldPerformanceSample {
  qualityStage: RpgQualityDegradationStage;
}

declare global {
  interface Window {
    __RPG_PERFORMANCE__?: Readonly<WorldPerformanceTelemetry>;
  }
}

export function WorldPerformanceMonitor({
  onSample
}: {
  onSample: (sample: Readonly<WorldPerformanceSample>) => void;
}) {
  const sampler = useRef(createWorldPerformanceSampler());
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    sampler.current.recordFrame(delta);
    if (!Number.isFinite(delta) || delta <= 0) return;
    elapsed.current += delta;
    if (elapsed.current + 1e-9 < 2) return;
    elapsed.current %= 2;
    onSample(sampler.current.read());
  });

  return null;
}
