import {
  RPG_QUALITY_DEGRADATION_ORDER,
  type RpgQualityDegradationStage
} from "./AdaptiveQuality";

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
  degradationStage?: RpgQualityDegradationStage;
  coarsePointer?: boolean;
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
    coarsePointer:
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches
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

export function getSceneQuality({
  level,
  reducedMotion,
  degradationStage = "full",
  coarsePointer = false
}: SceneQualityInput) {
  const levels = {
    high: {
      petals: { near: 36, middle: 52, far: 68 },
      particlesPerBurst: 220,
      trailSeconds: 1.15,
      minDpr: 1,
      // A retina panel reports 2. Capping under it drew the world at 88 per
      // cent of the panel's pixels and let the browser stretch the result,
      // which softened every outline and every painted face.
      maxDpr: 2
    },
    medium: {
      petals: { near: 28, middle: 34, far: 0 },
      particlesPerBurst: 140,
      trailSeconds: 1.15,
      minDpr: 1,
      maxDpr: 1.25
    },
    low: {
      petals: { near: 18, middle: 0, far: 0 },
      particlesPerBurst: 80,
      trailSeconds: 0.5,
      minDpr: 0.85,
      maxDpr: 1
    }
  } as const;
  const selected = levels[level];
  const stageIndex =
    RPG_QUALITY_DEGRADATION_ORDER.indexOf(degradationStage);
  const atLeast = (stage: RpgQualityDegradationStage) =>
    stageIndex >= RPG_QUALITY_DEGRADATION_ORDER.indexOf(stage);
  const pixelRatioDegraded = atLeast("pixel-ratio");
  const shadowsDegraded = atLeast("shadows");
  const fireworksDegraded = atLeast("fireworks");
  const farDecorationsDegraded = atLeast("far-decorations");
  const npcMotionDegraded = atLeast("npc-secondary-motion");
  const baseParticles = reducedMotion ? 72 : selected.particlesPerBurst;
  const baseTrailSeconds = reducedMotion ? 0.35 : selected.trailSeconds;

  return Object.freeze({
    level,
    degradationStage,
    coreLayers: Object.freeze({
      terrain: true,
      roads: true,
      collision: true,
      landmarks: true,
      player: true
    }),
    petals: Object.freeze(reducedMotion
      ? { near: 8, middle: 0, far: 0 }
      : { ...selected.petals }),
    petalRotationSpeed: reducedMotion ? 0 : 1,
    busPetalSwirl: !reducedMotion,
    minDpr: selected.minDpr,
    maxDpr: pixelRatioDegraded
      ? Math.min(selected.maxDpr, coarsePointer ? 1 : 1.25)
      : selected.maxDpr,
    shadowMapSize: shadowsDegraded
      ? Math.min(getSceneShadowMapSize(level), 1024)
      : getSceneShadowMapSize(level),
    shadowUpdateEveryFrames: shadowsDegraded ? 4 : 1,
    farDecorationDistance: farDecorationsDegraded ? 18 : 48,
    npcSecondaryMotion: !npcMotionDegraded,
    fireworks: Object.freeze({
      sequence: FIREWORK_SEQUENCE,
      particlesPerBurst: fireworksDegraded
        ? Math.floor(baseParticles * 0.5)
        : baseParticles,
      trailSeconds: fireworksDegraded
        ? baseTrailSeconds * 0.5
        : baseTrailSeconds,
      pointSize: reducedMotion ? 0.8 : 0.18,
      softPulseOnly: reducedMotion
    })
  });
}

export type SceneQualitySettings = ReturnType<typeof getSceneQuality>;
