import type { SceneQualityLevel } from "./SceneQuality";

const LEVELS: readonly SceneQualityLevel[] = ["low", "medium", "high"];

export function createAdaptiveQuality({
  initialLevel,
  sampleSeconds = 2,
  lowFps = 42,
  recoveryFps = 55
}: {
  initialLevel: SceneQualityLevel;
  sampleSeconds?: number;
  lowFps?: number;
  recoveryFps?: number;
}) {
  const maximumLevelIndex = LEVELS.indexOf(initialLevel);
  let levelIndex = maximumLevelIndex;
  let elapsed = 0;
  let frames = 0;
  let lowSamples = 0;
  let recoverySamples = 0;

  return {
    recordFrame(deltaSeconds: number) {
      if (
        !Number.isFinite(deltaSeconds) ||
        deltaSeconds <= 0 ||
        deltaSeconds > 0.25
      ) {
        return LEVELS[levelIndex];
      }
      elapsed += deltaSeconds;
      frames += 1;
      if (elapsed + 1e-9 < sampleSeconds) {
        return LEVELS[levelIndex];
      }

      const fps = frames / elapsed;
      elapsed = 0;
      frames = 0;
      if (fps < lowFps) {
        lowSamples += 1;
        recoverySamples = 0;
        if (lowSamples >= 2 && levelIndex > 0) {
          levelIndex -= 1;
          lowSamples = 0;
        }
      } else if (fps >= recoveryFps) {
        recoverySamples += 1;
        lowSamples = 0;
        if (recoverySamples >= 4 && levelIndex < maximumLevelIndex) {
          levelIndex += 1;
          recoverySamples = 0;
        }
      } else {
        lowSamples = 0;
        recoverySamples = 0;
      }
      return LEVELS[levelIndex];
    },
    getLevel() {
      return LEVELS[levelIndex];
    }
  };
}
