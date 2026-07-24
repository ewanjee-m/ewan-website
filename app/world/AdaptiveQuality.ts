import type { SceneQualityLevel } from "./SceneQuality";

const LEVELS: readonly SceneQualityLevel[] = ["low", "medium", "high"];
export const RPG_QUALITY_DEGRADATION_ORDER = [
  "full",
  "pixel-ratio",
  "shadows",
  "fireworks",
  "far-decorations",
  "npc-secondary-motion"
] as const;

export type RpgQualityDegradationStage =
  (typeof RPG_QUALITY_DEGRADATION_ORDER)[number];

export function createAdaptiveQuality({
  initialLevel,
  sampleSeconds = 2,
  lowFps = 42,
  recoveryFps = 55,
  lowSamplesBeforeChange = 2,
  recoverySamplesBeforeChange = 4
}: {
  initialLevel: SceneQualityLevel;
  sampleSeconds?: number;
  lowFps?: number;
  recoveryFps?: number;
  lowSamplesBeforeChange?: number;
  recoverySamplesBeforeChange?: number;
}) {
  const maximumLevelIndex = LEVELS.indexOf(initialLevel);
  let stageIndex = 0;
  let elapsed = 0;
  let frames = 0;
  let lowSamples = 0;
  let recoverySamples = 0;
  const getLegacyLevel = () => {
    const drops = Math.min(2, stageIndex);
    return LEVELS[Math.max(0, maximumLevelIndex - drops)];
  };

  return {
    recordFrame(deltaSeconds: number) {
      if (
        !Number.isFinite(deltaSeconds) ||
        deltaSeconds <= 0 ||
        deltaSeconds > 0.25
      ) {
        return getLegacyLevel();
      }
      elapsed += deltaSeconds;
      frames += 1;
      if (elapsed + 1e-9 < sampleSeconds) {
        return getLegacyLevel();
      }

      const fps = frames / elapsed;
      elapsed = 0;
      frames = 0;
      if (fps < lowFps) {
        lowSamples += 1;
        recoverySamples = 0;
        if (
          lowSamples >= lowSamplesBeforeChange &&
          stageIndex < RPG_QUALITY_DEGRADATION_ORDER.length - 1
        ) {
          stageIndex += 1;
          lowSamples = 0;
        }
      } else if (fps >= recoveryFps) {
        recoverySamples += 1;
        lowSamples = 0;
        if (
          recoverySamples >= recoverySamplesBeforeChange &&
          stageIndex > 0
        ) {
          stageIndex -= 1;
          recoverySamples = 0;
        }
      } else {
        lowSamples = 0;
        recoverySamples = 0;
      }
      return getLegacyLevel();
    },
    getLevel() {
      return getLegacyLevel();
    },
    getStage(): RpgQualityDegradationStage {
      return RPG_QUALITY_DEGRADATION_ORDER[stageIndex];
    }
  };
}
