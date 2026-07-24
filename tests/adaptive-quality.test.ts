import { describe, expect, it } from "vitest";
import {
  RPG_QUALITY_DEGRADATION_ORDER,
  createAdaptiveQuality
} from "../app/world/AdaptiveQuality";
import type { SceneQualityLevel } from "../app/world/SceneQuality";

function runFrames(
  quality: ReturnType<typeof createAdaptiveQuality>,
  fps: number,
  seconds: number
) {
  for (let frame = 0; frame < fps * seconds; frame += 1) {
    quality.recordFrame(1 / fps);
  }
}

describe("adaptive scene quality", () => {
  it("steps down after sustained low FPS and recovers more slowly", () => {
    const quality = createAdaptiveQuality({ initialLevel: "high" });

    runFrames(quality, 30, 4);
    expect(quality.getLevel()).toBe("medium");
    runFrames(quality, 30, 4);
    expect(quality.getLevel()).toBe("low");

    runFrames(quality, 60, 8);
    expect(quality.getLevel()).toBe("medium");
    runFrames(quality, 60, 8);
    expect(quality.getLevel()).toBe("high");
  });

  it("never recovers above the device's initial ceiling", () => {
    const quality = createAdaptiveQuality({ initialLevel: "medium" });

    runFrames(quality, 60, 20);

    expect(quality.getLevel()).toBe("medium");
  });

  it("degrades through the cumulative stages in the required order", () => {
    const quality = createAdaptiveQuality({
      initialLevel: "high",
      lowSamplesBeforeChange: 1
    });

    expect(quality.getStage()).toBe(RPG_QUALITY_DEGRADATION_ORDER[0]);
    for (const stage of RPG_QUALITY_DEGRADATION_ORDER.slice(1)) {
      runFrames(quality, 30, 2);
      expect(quality.getStage()).toBe(stage);
    }
  });

  it("keeps the legacy quality level return and getter type compatible", () => {
    const quality = createAdaptiveQuality({
      initialLevel: "high",
      lowSamplesBeforeChange: 1
    });
    const returned: SceneQualityLevel = quality.recordFrame(1 / 60);
    const current: SceneQualityLevel = quality.getLevel();

    expect(returned).toBe("high");
    expect(current).toBe("high");
  });
});
