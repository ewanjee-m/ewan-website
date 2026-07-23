import { describe, expect, it } from "vitest";
import {
  detectSceneQualityLevel,
  getSceneCanvasDpr,
  getSceneQuality,
  getSceneShadowMapSize
} from "../app/world/SceneQuality";

describe("scene quality", () => {
  it("removes far and then middle petals before the nearby direction cue", () => {
    const high = getSceneQuality({ level: "high", reducedMotion: false });
    const medium = getSceneQuality({ level: "medium", reducedMotion: false });
    const low = getSceneQuality({ level: "low", reducedMotion: false });

    expect(high.petals).toEqual({ near: 36, middle: 52, far: 68 });
    expect(medium.petals).toEqual({ near: 28, middle: 34, far: 0 });
    expect(low.petals).toEqual({ near: 18, middle: 0, far: 0 });
  });

  it("keeps the firework sequence while lowering particles and trail length", () => {
    const high = getSceneQuality({ level: "high", reducedMotion: false });
    const low = getSceneQuality({ level: "low", reducedMotion: false });

    expect(low.fireworks.sequence).toEqual(high.fireworks.sequence);
    expect(low.fireworks.particlesPerBurst).toBeLessThan(
      high.fireworks.particlesPerBurst
    );
    expect(low.fireworks.trailSeconds).toBeLessThan(
      high.fireworks.trailSeconds
    );
  });

  it("turns off rapid petal rotation and bus swirl for reduced motion", () => {
    const reduced = getSceneQuality({ level: "high", reducedMotion: true });

    expect(reduced.petals).toEqual({ near: 8, middle: 0, far: 0 });
    expect(reduced.petalRotationSpeed).toBe(0);
    expect(reduced.busPetalSwirl).toBe(false);
    expect(reduced.fireworks.softPulseOnly).toBe(true);
  });

  it("applies the detected mobile quality ceiling to the canvas DPR", () => {
    expect(
      detectSceneQualityLevel({ hardwareConcurrency: 8, coarsePointer: true })
    ).toBe("medium");
    expect(
      detectSceneQualityLevel({ hardwareConcurrency: 4, coarsePointer: true })
    ).toBe("low");
    expect(
      detectSceneQualityLevel({ hardwareConcurrency: 12, coarsePointer: false })
    ).toBe("high");
    expect(getSceneCanvasDpr("high")).toEqual([1, 2]);
    expect(getSceneCanvasDpr("medium")).toEqual([1, 1.25]);
    expect(getSceneCanvasDpr("low")).toEqual([0.85, 1]);
  });

  it("reserves a sharper static shadow map only for capable devices", () => {
    expect(getSceneShadowMapSize("high")).toBe(2048);
    expect(getSceneShadowMapSize("medium")).toBe(1024);
    expect(getSceneShadowMapSize("low")).toBe(0);
  });
});
