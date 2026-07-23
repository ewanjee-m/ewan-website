export type SceneQualityLevel = "high" | "medium" | "low";

const FIREWORK_SEQUENCE = [
  "gold-crown",
  "coral-peony",
  "sakura-chrysanthemum",
  "blue-ring",
  "gold-willow",
  "finale"
] as const;

interface SceneQualityInput {
  level: SceneQualityLevel;
  reducedMotion: boolean;
}

export function detectSceneQualityLevel({
  hardwareConcurrency,
  coarsePointer
}: {
  hardwareConcurrency: number;
  coarsePointer: boolean;
}): SceneQualityLevel {
  if (hardwareConcurrency <= 4) {
    return "low";
  }
  return coarsePointer ? "medium" : "high";
}

export function detectBrowserSceneQualityLevel(): SceneQualityLevel {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return "medium";
  }
  return detectSceneQualityLevel({
    hardwareConcurrency: navigator.hardwareConcurrency || 8,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches
  });
}

export function getSceneCanvasDpr(
  level: SceneQualityLevel
): [minimum: number, maximum: number] {
  const quality = getSceneQuality({ level, reducedMotion: false });
  return [quality.minDpr, quality.maxDpr];
}

export function getSceneShadowMapSize(level: SceneQualityLevel) {
  if (level === "high") {
    return 2048;
  }
  return level === "medium" ? 1024 : 0;
}

export function getSceneQuality({ level, reducedMotion }: SceneQualityInput) {
  const levels = {
    high: {
      petals: { near: 36, middle: 52, far: 68 },
      particlesPerBurst: 72,
      trailSeconds: 1.15,
      minDpr: 1,
      // A retina panel reports 2. Capping under it drew the world at 88 per
      // cent of the panel's pixels and let the browser stretch the result,
      // which softened every outline and every painted face.
      maxDpr: 2
    },
    medium: {
      petals: { near: 28, middle: 34, far: 0 },
      particlesPerBurst: 48,
      trailSeconds: 1.15,
      minDpr: 1,
      maxDpr: 1.25
    },
    low: {
      petals: { near: 18, middle: 0, far: 0 },
      particlesPerBurst: 28,
      trailSeconds: 0.5,
      minDpr: 0.85,
      maxDpr: 1
    }
  } as const;
  const selected = levels[level];

  return {
    petals: reducedMotion
      ? { near: 8, middle: 0, far: 0 }
      : { ...selected.petals },
    petalRotationSpeed: reducedMotion ? 0 : 1,
    busPetalSwirl: !reducedMotion,
    minDpr: selected.minDpr,
    maxDpr: selected.maxDpr,
    fireworks: {
      sequence: FIREWORK_SEQUENCE,
      particlesPerBurst: reducedMotion ? 18 : selected.particlesPerBurst,
      trailSeconds: reducedMotion ? 0.35 : selected.trailSeconds,
      softPulseOnly: reducedMotion
    }
  };
}
